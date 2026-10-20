#!/usr/bin/env bash
# start-judging.sh — Floor: the whole off-chain backend locally (judging mode).
#
#     ./start-judging.sh start        # onebox + shares the PUBLIC URL via judging-tunnel
#     ./start-judging.sh onebox       # onebox only, local (no public URL)
#     ./start-judging.sh stop
#     ./start-judging.sh status
#     ./start-judging.sh url          # the two env lines to paste into Vercel
#     ./start-judging.sh logs [onebox]
#     ./start-judging.sh awake        # stop GNOME auto-suspend while judging
#
# What runs: apps/onebox on :8790 — API (/v1/*, /healthz) + MCP (/mcp) + indexer + keeper,
# ONE process (same as Render's `pnpm --filter @floor/onebox start`).
#
# PUBLIC URL: shared with bhaiya-please (one ngrok static domain). A slash router at
# ~/Documents/Projects/judging-tunnel/proxy.mjs sends  /v1*, /mcp, /mcp/*, /healthz  here,
# everything else to the bhaiya worker (:8787). Ownership: judging-tunnel/start-judging-url.sh.
#
# Env, lowest → highest priority: .env → .env.render → .judging/floor.env.
# Put the REACHABLE Postgres (Supabase) DATABASE_URL in .judging/floor.env — the Render one in
# .env is unreachable from a laptop, without this the indexer stays disabled.
# NOTE: while this is up, render and this process share the same Postgres indexer tables
# (idempotent, keyed) — consider suspending the Render service while judging.
# ------------------------------------------------------------------------------
set -u
set -m

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JDIR="$ROOT/.judging"; LOGS="$JDIR/logs"
mkdir -p "$LOGS"
HEALTH_LOCAL="http://127.0.0.1:${PORT:-8790}/healthz"
TUNNEL="$HOME/Documents/Projects/judging-tunnel/start-judging-url.sh"

say() { printf '%s\n' "$*"; }
die() { printf 'start-judging: %s\n' "$*" >&2; exit 1; }

# ------------------------------------------------------------------ env: .env -> .env.render -> .judging/floor.env
for f in "$ROOT/.env" "$ROOT/.env.render" "$JDIR/floor.env"; do
  [ -f "$f" ] && { set -a; . "$f"; set +a; }
done

PORT="${PORT:-8790}"
export TRUST_PROXY="${TRUST_PROXY:-1}"
export INDEXER_INTERVAL_SEC="${INDEXER_INTERVAL_SEC:-60}"
export KEEPER_INTERVAL_SEC="${KEEPER_INTERVAL_SEC:-60}"
export KEEPER_ROUTE="${KEEPER_ROUTE:-direct}"

private_url() { case "$1" in *127.0.0.1*|*localhost*) return 1 ;; http*://*) return 0 ;; *            ) return 1 ;; esac; }
rpc_live() { # <url>: true when it answers eth_blockNumber
  local r
  r="$(curl -fsS --max-time 6 -X POST "$1" -H 'content-type: application/json' \
       -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' 2>/dev/null | jq -r '.result // empty' 2>/dev/null)"
  [ -n "$r" ];
}
if [ -z "${FLOOR_RPC_URL:-}" ]; then
  for C in "${BSC_RPC_URL:-}" "${BSC_FORK_RPC_URL:-}" "https://bsc-dataseed.bnbchain.org"; do
    { [ -n "$C" ] && private_url "$C"; } || continue
    if rpc_live "$C"; then export FLOOR_RPC_URL="$C"; say "• FLOOR_RPC_URL: $C (verified live)"; break
    else say "warn: RPC $C not responding (quota/exhausted?), trying the next one"
    fi
  done
  [ -n "${FLOOR_RPC_URL:-}" ] || { export FLOOR_RPC_URL="https://bsc-dataseed.bnbchain.org"; say "warn: no configured RPC answered — defaulting to bsc-dataseed"; }
fi

# Paid tools: prod runs b402 (BW3 keys only). '.env.render' says self but has no SELF_FACILITATOR_KEY,
# which would crash onebox at boot — auto-recover instead:
if [ -n "${X402_PAYTO:-}" ]; then
  case "${X402_FACILITATOR:-self}" in
    self|Self|'')
      if [ -n "${SELF_FACILITATOR_KEY:-}" ]; then say "• paid tools: self facilitator"
      elif [ -n "${BW3_API_KEY:-}" ] && [ -n "${BW3_API_SECRET:-}" ]; then
        export X402_FACILITATOR=b402; say "• paid tools: b402 facilitator (BW3 keys)"
      else
        unset X402_PAYTO X402_FACILITATOR
        say "warn: paid tools DISABLED (no BW3 keys / self key). Unpaid reads all still work."
      fi ;;
  esac
fi

# ------------------------------------------------------------------ shared domain (read from the one source of truth)
shared_env() {
  local ENVF="$HOME/Documents/Projects/bhaiya-please/.judging/ngrok.env"
  [ -s "$ENVF" ] && { . "$ENVF"; return 0; }
  return 1
}

worker_up()   { curl -fsS --max-time 3 "$HEALTH_LOCAL" >/dev/null 2>&1; }
worker_body() { curl -fsS --max-time 5 "$HEALTH_LOCAL" 2>/dev/null || true; }
wait_for_up() { for _ in $(seq "$2"); do "$1" && return 0; sleep 1; done; return 1; }

# ------------------------------------------------------------------ onebox
start_worker() {
  if worker_up; then say "✓ onebox already up on :$PORT (reusing it)"; return 0; fi
  say "• starting Floor onebox on :$PORT (API + /mcp + indexer + keeper) …"
  : > "$LOGS/onebox.log"
  ( cd "$ROOT" && nohup env PORT="$PORT" pnpm --silent --filter @floor/onebox start >> "$LOGS/onebox.log" 2>&1 & echo $! > "$JDIR/onebox.pid" )
  if ! wait_for_up worker_up 90; then
    tail -n 30 "$LOGS/onebox.log" >&2
    die "onebox did not become healthy — see .judging/logs/onebox.log"
  fi
  say "✓ onebox healthy on :$PORT"
}

cmd_start() {
  start_worker
  if worker_up && worker_body | jq -e '.keeper.mode == "dry-run"' >/dev/null 2>&1; then
    say "note: keeper is DRY-RUN — real rebalances need KEEPER_PRIVATE_KEY in .judging/floor.env"
  fi
  if [ -n "${JUDGE_ROOT:-}" ]; then say "• public URL is managed by the caller (judging-tunnel)"; return 0; fi
  if [ ! -x "$TUNNEL" ]; then
    say "! $TUNNEL not found — Floor is local-only (no public URL)"
    return 0
  fi
  if shared_env && curl -fsS --max-time 4 "http://127.0.0.1:8888/__proxy__" >/dev/null 2>&1; then
    say "✓ shared URL already live:  https://$NGROK_DOMAIN"
    return 0
  fi
  say "• launching the shared URL router (slash proxy + tunnel; brings up bhaiya's worker too) …"
  ( "$TUNNEL" start ) & disown 2>/dev/null || true
  sleep 3
  if shared_env && curl -fsS --max-time 6 "https://$NGROK_DOMAIN/__proxy__" >/dev/null 2>&1; then
    say "✓ shared URL live:  https://$NGROK_DOMAIN"
  else
    say "! tunnel not confirmed yet — check:  $TUNNEL status"
  fi
}

cmd_onebox() { start_worker; }

cmd_stop() {
  local pid
  [ -f "$JDIR/onebox.pid" ] && {
    pid="$(cat "$JDIR/onebox.pid")"
    kill -TERM -- -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
    rm -f "$JDIR/onebox.pid"
  }
  pid="$(ss -ltnp "sport = :$PORT" 2>/dev/null | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2)"
  if [ -n "$pid" ]; then kill -TERM "$pid" 2>/dev/null || true; fi
  pkill -TERM -f 'tsx src/server.ts' 2>/dev/null || true
  say "stopped (onebox). The shared URL+tunnel keeps running: ~/Documents/Projects/judging-tunnel/start-judging-url.sh stop (or 'stop all')"
}

cmd_status() {
  if worker_up; then
    say "onebox :$PORT  UP"
    jq -C '{ok, "api":(.api.ok//null), "mcp":(.mcp.ok//null), keeper:{mode:(.keeper.mode//null), running:(.keeper.running//null), lastError:(.keeper.lastError//null)}, indexer:{enabled:(.indexer.enabled//null), headLag:(.indexer.headLag//null)}, uptimeSec}' <<<"$(worker_body)" 2>/dev/null || printf '%s\n' "$(worker_body)"
  else
    say "onebox :$PORT  DOWN (run: ./start-judging.sh)"
  fi
  if shared_env; then
    if curl -fsS --max-time 6 "https://$NGROK_DOMAIN/healthz" >/dev/null 2>&1; then
      say "through shared URL  https://$NGROK_DOMAIN/healthz  OK"
    else
      say "shared URL https://$NGROK_DOMAIN not serving Floor (run: ~/Documents/Projects/judging-tunnel/start-judging-url.sh start)"
    fi
  else
    say "shared URL  (bhaiya's .judging/ngrok.env missing — no public domain configured)"
  fi
}

cmd_url() {
  shared_env || die "shared domain not configured — ~/Documents/Projects/bhaiya-please/.judging/ngrok.env missing"
  say "NEXT_PUBLIC_API_URL=https://$NGROK_DOMAIN"
  say "NEXT_PUBLIC_MCP_URL=https://$NGROK_DOMAIN/mcp"
}

cmd_logs() {
  case "${1:-onebox}" in
    onebox) tail -n 60 -f "$LOGS/onebox.log" ;;
    *) die "logs [onebox]" ;;
  esac
}

cmd_awake() {
  if gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type 'nothing' 2>/dev/null; then
    say "✓ GNOME will not auto-suspend while on AC power"
  else
    say "! gsettings failed (not a GNOME session?)"
  fi
  cat <<'EOF'

Note: closing the lid still suspends (systemd-logind). One-time config if needed:

  echo -e "[HandleLidSwitch]\nHandleLidSwitch=ignore\nHandleLidSwitchExternalPower=ignore" | \
    sudo tee /etc/systemd/logind.conf.d/lid.conf && sudo systemctl restart systemd-logind

EOF
}

case "${1:-start}" in
  start)   cmd_start ;;
  onebox)  cmd_onebox ;;
  stop)    cmd_stop ;;
  restart) cmd_stop; sleep 1; cmd_start ;;
  status)  cmd_status ;;
  url)     cmd_url ;;
  logs)    shift; cmd_logs "$@" ;;
  awake)   cmd_awake ;;
  *) die "usage: ./start-judging.sh [start|onebox|stop|restart|status|url|logs|awake]" ;;
esac
