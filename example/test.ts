import { ID, Int, Float, Default } from "../types";

interface MainQuery {
    foo: Foo;
}
interface Foo {
    __typename: 'Foo';
    id: ID;
    name: string;
    value?: number;
    size: Int;
    br: Bar;
    baz: Baz;
    coord: {
        __typename: 'Coord';
        /** Hey */
        x: Float;
        y: Float;
    };
}

type Union = Foo | Bar;

/**
 * Bar doc
 */
interface Bar extends Foo {
    /** Doc for bar */
    bar?: string;
    items: Foo[];
    items2?: Foo[][];
    /**
     * Long doc for hi
     */
    hi?: Union;
}

interface Baz {
    retInt(args: {
        a?: Default<Int, 12>;
        b?: Default<string, 'hi'>;
        c?: Default<boolean, true>;
        d: Default<boolean, false>;
    }): Int;
    foo(args: {
        /** some doc */
        foo?: number;
    }): Bar;
}
