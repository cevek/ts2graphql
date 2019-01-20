export type AllTypes = InterfaceType | UnionType | EnumType | NativeType | PrimitiveType;
export interface PrimitiveType {
    kind: 'primitive';
    type: 'number' | 'string' | 'boolean' | string;
    literal: string | number | boolean | undefined;
}
export interface NativeType {
    kind: 'native';
    type: 'array';
    element: AllTypes;
}
export interface InterfaceType {
    id: number;
    doc: string | undefined;
    name: 'anonymous' | string;
    kind: 'interface';
    members: Prop[];
}
export interface UnionType {
    id: number;
    doc: string | undefined;
    name: string;
    kind: 'union';
    members: AllTypes[];
}
export interface EnumType {
    id: number;
    doc: string | undefined;
    name: string;
    kind: 'enum';
    members: Prop[];
}
export interface Prop {
    doc: string | undefined;
    name: string;
    type: AllTypes;
    defaultValue: string | number | boolean | undefined;
    args: (Prop[]) | undefined;
    optional: boolean;
}

type Resolver<T> = { [P in keyof T]: TypeSwitch<T[P]> };
type TypeSwitch<T> = T extends (args: infer Args) => infer Ret
    ? (ctx?: never, args?: Args) => Promise<Resolver<Ret>>
    : Resolver<T> | (() => Promise<Resolver<T>>);

export type ID = string;
export type Int = number;
export type Float = number;
export type Default<Type, Value extends Type> = Type;
