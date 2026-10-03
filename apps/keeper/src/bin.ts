import { main } from './cli.js';

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e) => {
    // never print a stack that could carry config; message only
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  },
);
