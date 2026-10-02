// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {FloorVault} from "../../src/FloorVault.sol";
import {IFloorVault} from "../../src/interfaces/IFloorVault.sol";
import {MockToken} from "../mocks/MockToken.sol";
import {VaultBase} from "./Vault.t.sol";

/// @dev Token anyone can pull from any holder (models a token with a hidden transfer hook).
contract LeakyToken is ERC20 {
    constructor() ERC20("LEAK", "LEAK") {}

    function mint(address to, uint256 a) external {
        _mint(to, a);
    }

    function steal(address from, address to, uint256 a) external {
        _transfer(from, to, a);
    }
}

/// @dev Configurable hostile router. `mode` selects the behaviour; all modes try to hurt the vault.
contract EvilRouter {
    enum Mode {
        Honest,
        PullMoreThanApproved, // transferFrom(vault, amountIn + 1)
        PayNothing, // takes amountIn, pays nothing
        PayThirdParty, // takes amountIn, pays output to `third`
        StealOther, // honest swap but also steals `other` via a leaky token
        ReenterPublic, // calls vault.rebalancePublic mid-swap
        ReenterExit, // calls vault.exitInKind mid-swap
        TakeNothingPayNothing,
        TakePartial // takes half of the approved amount, pays fair output for it
    }

    Mode public mode;
    address public third;
    address public other;
    address public vault;
    address public usdt;
    address public stock;
    uint256 public payOut;

    function configure(Mode m, address third_, address other_, address vault_, address usdt_, address stock_, uint256 p)
        external
    {
        mode = m;
        third = third_;
        other = other_;
        vault = vault_;
        usdt = usdt_;
        stock = stock_;
        payOut = p;
    }

    /// @dev `amountIn` of USDT is pulled; `out` of stock is paid (when honest).
    function go(uint256 amountIn, uint256 out) external {
        if (mode == Mode.PullMoreThanApproved) {
            IERC20(usdt).transferFrom(msg.sender, address(this), amountIn + 1);
        } else if (mode == Mode.PayNothing) {
            IERC20(usdt).transferFrom(msg.sender, address(this), amountIn);
        } else if (mode == Mode.PayThirdParty) {
            IERC20(usdt).transferFrom(msg.sender, address(this), amountIn);
            IERC20(stock).transfer(third, out);
        } else if (mode == Mode.StealOther) {
            IERC20(usdt).transferFrom(msg.sender, address(this), amountIn);
            IERC20(stock).transfer(msg.sender, out);
            LeakyToken(other).steal(msg.sender, address(this), 1);
        } else if (mode == Mode.ReenterPublic) {
            IFloorVault(vault).rebalancePublic(0);
        } else if (mode == Mode.ReenterExit) {
            IFloorVault(vault).exitInKind(address(this));
        } else if (mode == Mode.TakePartial) {
            IERC20(usdt).transferFrom(msg.sender, address(this), amountIn / 2);
            IERC20(stock).transfer(msg.sender, out / 2);
        } else if (mode == Mode.Honest) {
            IERC20(usdt).transferFrom(msg.sender, address(this), amountIn);
            IERC20(stock).transfer(msg.sender, out);
        }
    }
}

contract SwapGuardTest is VaultBase {
    EvilRouter internal evil;
    LeakyToken internal leaky;
    FloorVault internal v2; // two-asset vault (stock + leaky)

    uint256 internal constant AMT = 4000e18;

    function setUp() public override {
        super.setUp();
        evil = new EvilRouter();
        factory.setRouter(address(evil), address(evil), true);
        stock.mint(address(evil), 1e30);
        leaky = new LeakyToken();
        factory.setAsset(address(leaky), address(pool), 2500, true, 1e20, 25_000e18, false);
        factory.setMultiplier(address(leaky), 1e18, 0);
        // leaky.uiMultiplier() does not exist; two-asset vault is used only through paths that skip it (see test)
    }

    function _data(uint256 out) internal view returns (bytes memory) {
        return abi.encodeCall(EvilRouter.go, (AMT, out));
    }

    function _fair() internal view returns (uint256) {
        return AMT * 1e18 / _price();
    }

    function _try(EvilRouter.Mode m, address third) internal {
        evil.configure(m, third, address(leaky), address(vault), address(usdt), address(stock), 0);
    }

    function _run(bytes memory data) internal {
        IFloorVault.Swap memory s = IFloorVault.Swap(0, true, AMT, address(evil), data);
        vm.prank(keeper);
        vault.rebalance(s);
    }

    function test_honestEvilRouterBaseline() public {
        _try(EvilRouter.Mode.Honest, address(0));
        _run(_data(_fair()));
        assertEq(usdt.allowance(address(vault), address(evil)), 0);
        assertEq(stock.balanceOf(address(vault)), _fair());
    }

    function test_pullMoreThanApprovedFails() public {
        _try(EvilRouter.Mode.PullMoreThanApproved, address(0));
        uint256 u = usdt.balanceOf(address(vault));
        bytes memory d = _data(_fair());
        vm.expectRevert(IFloorVault.SwapFailed.selector);
        _run(d);
        assertEq(usdt.balanceOf(address(vault)), u);
    }

    function test_payNothingFails_minOut() public {
        _try(EvilRouter.Mode.PayNothing, address(0));
        vm.expectPartialRevert(IFloorVault.MinOutNotMet.selector);
        _run(_data(0));
    }

    function test_payThirdPartyFails() public {
        _try(EvilRouter.Mode.PayThirdParty, rando);
        bytes memory d = _data(_fair());
        vm.expectPartialRevert(IFloorVault.MinOutNotMet.selector);
        _run(d);
        assertEq(stock.balanceOf(rando), 0);
    }

    function test_reentrancyBlocked() public {
        _try(EvilRouter.Mode.ReenterPublic, address(0));
        vm.expectRevert(IFloorVault.SwapFailed.selector);
        _run(_data(0));
        _try(EvilRouter.Mode.ReenterExit, address(0));
        vm.expectRevert(IFloorVault.SwapFailed.selector);
        _run(_data(0));
    }

    function test_takePartial_allowanceStillZero() public {
        // takes half the approved USDT and pays fair output for it: allowed (spent <= amountIn), but minOut
        // is computed on the full amountIn so a half fill fails
        _try(EvilRouter.Mode.TakePartial, address(0));
        bytes memory d = _data(_fair());
        vm.expectPartialRevert(IFloorVault.MinOutNotMet.selector);
        _run(d);
    }

    function test_routerCannotBeTrackedToken() public {
        factory.setRouter(address(usdt), address(usdt), true);
        IFloorVault.Swap memory s = IFloorVault.Swap(
            0, true, AMT, address(usdt), abi.encodeCall(IERC20.transfer, (rando, usdt.balanceOf(address(vault))))
        );
        vm.prank(keeper);
        vm.expectRevert(IFloorVault.RouterNotAllowed.selector);
        vault.rebalance(s);
        assertEq(usdt.balanceOf(rando), 0);
    }

    function test_otherTrackedBalanceDecreasedFails() public {
        address[] memory a = new address[](2);
        a[0] = address(stock);
        a[1] = address(leaky);
        uint16[] memory w = new uint16[](2);
        w[0] = 5000;
        w[1] = 5000;
        usdt.mint(user, 10_000e18);
        vm.prank(user);
        usdt.approve(address(factory), 10_000e18);
        FloorVault v = FloorVault(_createAs(10_000e18, 9000, uint40(T0 + 365 days), a, w));
        leaky.mint(address(v), 1e18);
        (,,,, uint256 amt,,) = _preview2(v);
        evil.configure(
            EvilRouter.Mode.StealOther, address(0), address(leaky), address(v), address(usdt), address(stock), 0
        );
        bytes memory data = abi.encodeCall(EvilRouter.go, (amt, amt * 1e18 / _price()));
        IFloorVault.Swap memory s = IFloorVault.Swap(0, true, amt, address(evil), data);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(IFloorVault.OtherBalanceDecreased.selector, address(leaky)));
        v.rebalance(s);
    }

    function _preview2(FloorVault v) internal view returns (bool, uint8, bool, address, uint256, address, uint256) {
        (bool n, uint8 i, bool b, address tin,, uint256 amt,,) = v.previewRebalance();
        require(n && b && i == 0, "preview");
        return (n, i, b, tin, amt, address(0), 0);
    }

    function test_separateApproveTarget() public {
        // approveTarget differs from router: the allowance goes to the target only, then back to zero
        ApprovalHolder holder = new ApprovalHolder();
        PullViaHolder r = new PullViaHolder();
        factory.setRouter(address(r), address(holder), true);
        stock.mint(address(r), 1e30);
        uint256 fair = _fair();
        bytes memory data = abi.encodeCall(PullViaHolder.go, (holder, usdt, stock, AMT, fair));
        IFloorVault.Swap memory s = IFloorVault.Swap(0, true, AMT, address(r), data);
        vm.prank(keeper);
        vault.rebalance(s);
        assertEq(usdt.allowance(address(vault), address(holder)), 0);
        assertEq(usdt.allowance(address(vault), address(r)), 0);
        assertEq(stock.balanceOf(address(vault)), fair);
    }
}

contract ApprovalHolder {
    function pull(address from, IERC20 t, uint256 amt, address to) external {
        t.transferFrom(from, to, amt);
    }
}

contract PullViaHolder {
    function go(ApprovalHolder h, IERC20 tin, IERC20 tout, uint256 amt, uint256 out) external {
        h.pull(msg.sender, tin, amt, address(this));
        tout.transfer(msg.sender, out);
    }
}
