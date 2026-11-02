import * as react from 'react';
import { ReactNode } from 'react';

interface ErrorPageProps {
    error: Error & {
        digest?: string;
    };
    reset?: () => void;
    where?: string;
    endpoint?: string;
    title?: ReactNode;
    message?: ReactNode;
    retryLabel?: string;
    startLabel?: string;
    startHref?: string;
    accent?: string;
    accentText?: string;
}
declare function ErrorPage({ error, reset, where, endpoint, title, message, retryLabel, startLabel, startHref, accent, accentText, }: ErrorPageProps): react.JSX.Element;
declare function GlobalErrorPage({ background, color, ...props }: ErrorPageProps & {
    background?: string;
    color?: string;
}): react.JSX.Element;
declare function WatchtowerListener({ endpoint }: {
    endpoint?: string;
}): null;

export { ErrorPage, type ErrorPageProps, GlobalErrorPage, WatchtowerListener };
