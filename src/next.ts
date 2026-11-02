// The three names a Next app uses, so each is one line to wire up:
//   instrumentation.ts:        export { onRequestError } from "@demonbloodx2/watchtower/next";
//   app/api/report-error/route.ts:  export { POST, GET } from "@demonbloodx2/watchtower/next";
//   instrumentation.ts, in register(): import { watchConsole } from "@demonbloodx2/watchtower"; watchConsole();
export { onRequestError, watchConsole, handleBrowserErrorReport as POST, handleErrorReportTest as GET } from "./index";
