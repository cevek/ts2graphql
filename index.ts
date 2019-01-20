export { createSchema } from './createSchema';
export * from './types';

export function fromPromise<T>(fn: () => Promise<T>[]): T[];
export function fromPromise<T>(fn: () => Promise<T>): T;
export function fromPromise<T>(fn: Promise<T>): T;
export function fromPromise<T>(fn: Promise<T>[]): T[];
export function fromPromise<T>(fn: any): any {
    return fn;
}
