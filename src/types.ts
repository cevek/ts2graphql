type Resolver<T> = { [P in keyof T]: TypeSwitch<T[P]> };
type TypeSwitch<T> = T extends (args: infer Args) => infer Ret
    ? (ctx?: never, args?: Args) => Promise<Resolver<Ret>>
    : Resolver<T> | (() => Promise<Resolver<T>>);
