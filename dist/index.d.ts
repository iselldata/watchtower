type Kind = "error" | "rejected" | "browser";
interface WatchtowerOptions {
    token?: string;
    chatId?: string;
    app?: string;
    quietMs?: number;
    perMinute?: number;
    fetch?: typeof fetch;
}
interface Issue {
    path: (string | number)[];
    message: string;
}
declare function createWatchtower(options?: WatchtowerOptions): {
    reportError: (where: string, error: unknown, extra?: Record<string, unknown>) => void;
    reportRejected: (where: string, issues: Issue[]) => void;
    reportBrowserError: (body: unknown, userAgent: string | null) => void;
    handleBrowserErrorReport: (request: Request) => Promise<Response>;
    handleErrorReportTest: (request: Request) => Promise<Response>;
    onRequestError: (error: unknown, request: {
        path: string;
        method: string;
    }, context: {
        routerKind?: string;
        routePath?: string;
        routeType?: string;
    }) => void;
};
declare const reportError: (where: string, error: unknown, extra?: Record<string, unknown>) => void;
declare const reportRejected: (where: string, issues: Issue[]) => void;
declare const reportBrowserError: (body: unknown, userAgent: string | null) => void;
declare const handleBrowserErrorReport: (request: Request) => Promise<Response>;
declare const handleErrorReportTest: (request: Request) => Promise<Response>;
declare const onRequestError: (error: unknown, request: {
    path: string;
    method: string;
}, context: {
    routerKind?: string;
    routePath?: string;
    routeType?: string;
}) => void;

export { type Issue, type Kind, type WatchtowerOptions, createWatchtower, handleBrowserErrorReport, handleErrorReportTest, onRequestError, reportBrowserError, reportError, reportRejected };
