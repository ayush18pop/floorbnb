import { parseAbi } from 'viem';

export const lensAbi = parseAbi([
  'function scan(uint256 from, uint256 to) view returns (address[] needing)',
]);

export const factoryAbi = parseAbi([
  'function isTradingOpen(uint256 ts) view returns (bool)',
  'function routerOk(address router) view returns (bool ok, address approveTarget)',
  'function assets(address token) view returns (address pool, uint24 fee, bool active, uint128 minLiquidity, uint256 maxTradeValue, bool usdtIsToken0)',
  'function paused() view returns (bool)',
  'function halted() view returns (bool)',
  'function nonTradingDay(uint32 day) view returns (bool)',
  'function positionsCount() view returns (uint256)',
  'function isKeeper(address who) view returns (bool)',
  'function v3SwapRouter() view returns (address)',
  'function usdt() view returns (address)',
]);

export const vaultAbi = parseAbi([
  'struct Swap { uint8 assetIdx; bool buy; uint256 amountIn; address router; bytes data; }',
  'function rebalance(Swap s)',
  'function previewRebalance() view returns (bool needed, uint8 assetIdx, bool buy, address tokenIn, address tokenOut, uint256 amountIn, uint256 minOutAgg, uint256 minOutDirect)',
  'function minTrade() view returns (uint256)',
  'function minInterval() view returns (uint32)',
  'function lastTradeAt(uint8 assetIdx) view returns (uint40)',
  'function assetAt(uint256 i) view returns (address)',
  'event Rebalanced(uint8 indexed assetIdx, bool buy, uint256 amountIn, uint256 amountOut, uint256 V, uint256 exposureTarget, address indexed router, address caller)',
  'error NotKeeper()',
  'error TradingClosed()',
  'error NoTradeNeeded()',
  'error WrongDirection()',
  'error AmountOutOfRange()',
  'error TooSoon()',
  'error RouterNotAllowed()',
  'error SwapFailed()',
  'error MinOutNotMet(uint256 got, uint256 min)',
  'error TokenInSpentTooMuch()',
  'error OtherBalanceDecreased(address token)',
  'error PriceDeviation()',
  'error OracleHistoryTooShort()',
  'error PoolIlliquid()',
  'error TokenImplChanged()',
  'error MultiplierTransition()',
  'error BadStatus()',
]);

export const tokenAbi = parseAbi([
  'function pauseManager() view returns (address)',
]);

export const pauseManagerAbi = parseAbi([
  'function isTokenPaused(address token) view returns (bool)',
]);

export const pancakeRouterAbi = parseAbi([
  'struct ExactInputSingleParams { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 deadline; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }',
  'function exactInputSingle(ExactInputSingleParams params) payable returns (uint256 amountOut)',
]);
