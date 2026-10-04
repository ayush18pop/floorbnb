# HOLIDAYS

- Table extended to 2028-12-31 (27 closures, early closes counted as closures), horizon unixDay 21549. NYSE has not published 2029.
- Factory: `createPosition` reverts if (now + term + 14 d) / 1 day > holidayHorizonDay. `setHolidayHorizon(uint32)` and `setNonTradingDays` are guardian-only, no length cap: extend later without redeploy.
- Rule: term_max = horizon - 14 days - now (horizon 2028-12-31 => 365-day terms creatable until 2027-12-18; was 2026-12-17).
- Sources: nyse.com/trade/hours-calendars; NYSE Group press release 2025-12-23 (businesswire / ir.theice.com).
- Checker: `python3 packages/contracts/holidays/gen_holidays.py --check`.
