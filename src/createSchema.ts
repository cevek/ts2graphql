import {
    GraphQLBoolean,
    GraphQLEnumType,
    GraphQLEnumTypeConfig,
    GraphQLFieldConfigArgumentMap,
    GraphQLFieldConfigMap,
    GraphQLFloat,
    GraphQLID,
    GraphQLInputObjectType,
    GraphQLInputType,
    GraphQLInt,
    GraphQLList,
    GraphQLNonNull,
    GraphQLObjectType,
    GraphQLOutputType,
    GraphQLScalarType,
    GraphQLSchema,
    GraphQLString,
    GraphQLType,
    GraphQLUnionType,
    GraphQLError,
    Kind,
    ValueNode,
} from 'graphql';
import * as ts from 'typescript';
import {DateType} from './date';
import {typeAST, AllTypes, Interface, Primitive, Union, InterfaceLiteral, UnionLiteral, Enum} from 'ts-type-ast';

type CustomScalarFactory = (type: Primitive) => GraphQLScalarType | undefined;
export function createSchema(
    fileName: string,
    options: {customScalars?: GraphQLScalarType[]; customScalarFactory?: CustomScalarFactory} = {},
) {
    const customScalarsMap = new Map<string, GraphQLScalarType>();
    (options.customScalars || []).forEach(value => customScalarsMap.set(value.name, value));
    const customScalar = options.customScalarFactory;

    const program = ts.createProgram({options: {strict: true}, rootNames: [fileName]});
    const checker = program.getTypeChecker();
    const sourceFile = program.getSourceFile(fileName)!;
    //@ts-ignore
    const types = typeAST(checker, sourceFile);
    const map = new Map<AllTypes, GraphQLType>();
    let anonTypeIdx = 0;

    const schema = createSchemaFromTypes();
    return schema;

    function createSchemaFromTypes() {
        let query!: GraphQLObjectType;
        let mutation: GraphQLObjectType | undefined;
        for (let i = 0; i < types.length; i++) {
            const type = types[i];
            if (type.kind === 'interface' && (type.name === 'Query' || type.name === 'Mutation')) {
                const gqlType = createGQL(types[i], false);
                if (gqlType instanceof GraphQLObjectType) {
                    if (type.name === 'Query') {
                        query = gqlType;
                    }
                    if (type.name === 'Mutation') {
                        mutation = gqlType;
                    }
                }
            }
        }
        if (!(query||mutation)) throw new Error("No 'Query' or 'Mutation' type found");
        return new GraphQLSchema({
            query: query,
            mutation: mutation,
        });
    }

    function add(type: AllTypes, gqltype: GraphQLType) {
        map.set(type, gqltype);
        return gqltype;
    }
    function createGQL(type: AllTypes, isInput: boolean): GraphQLType {
        const gqlType = map.get(type);
        if (gqlType) return gqlType;
        switch (type.kind) {
            case 'interface':
            case 'interfaceLiteral':
                return createGQLType(type, isInput);
            case 'enum':
                return add(type, createGQLEnum(type));
            case 'union':
            case 'unionLiteral':
                if (isInput) return add(type, createGQLInputUnion(type));
                else if (type.members.every(member => member.kind === 'primitive' && member.type === 'string')) return GraphQLString;
                else if (type.members.every(member => member.kind === 'primitive' && member.type === 'number' && member.rawType === 'Int')) return GraphQLInt;
                else if (type.members.every(member => member.kind === 'primitive' && member.type === 'number')) return GraphQLFloat;
                else if (type.members.every(member => member.kind === 'primitive')) throw new Error('Union primitives are not supported');
                return add(type, createGQLUnion(type));
            case 'array':
                return new GraphQLList(add(type, nullable(false, createGQL(type.element, isInput))));
            case 'native':
                if (type.name === 'Date') {
                    return nonNull(DateType);
                }
                throw new Error('Unexpected type: ' + type.name);
            case 'primitive':
                return add(type, createGQLPrimitive(type));
        }
        throw new Error('Unexpected type: ' + JSON.stringify(type));
    }

    function nullable(nullable: boolean, type: GraphQLType) {
        return nullable || type instanceof GraphQLNonNull ? type : new GraphQLNonNull(type);
    }

    function createGQLType(type: Interface | InterfaceLiteral, isInput: boolean): GraphQLType {
        let typeName = type.kind === 'interface' ? type.name : '';
        const Class = isInput ? (GraphQLInputObjectType as unknown as typeof GraphQLObjectType) : GraphQLObjectType;

        const fields = {} as GraphQLFieldConfigMap<{}, {}>;
        if (type.kind === 'interfaceLiteral') {
            for (let i = 0; i < type.members.length; i++) {
                const member = type.members[i];
                if (
                    member.name === '__typename' &&
                    member.type.kind === 'primitive' &&
                    typeof member.type.literal === 'string'
                ) {
                    typeName = member.type.literal;
                }
            }
        }
        if (typeName === '') typeName = 'Anonymous' + (isInput ? 'Input' : '') + ++anonTypeIdx;
        const gqlType = new Class({
            name: typeName,
            description: type.kind === 'interface' ? type.doc : undefined,
            fields: fields,
        });
        add(type, gqlType);
        type.members.reduce((obj, member) => {
            // if (member.orUndefined) throw new Error('Undefined props are not supported in graphql');
            const memberType = {
                type: nullable(member.orNull||member.orUndefined, createGQL(member.type, false)) as GraphQLOutputType,
                args:
                    member.args && member.args.length === 1
                        ? (member.args[0].type as InterfaceLiteral).members.reduce(
                              (acc, arg) => {
                                  acc[arg.name] = {
                                      description: arg.doc,
                                      defaultValue: undefined,
                                      type: nullable(arg.orNull, createGQL(arg.type, true)) as GraphQLInputType,
                                  };
                                  return acc;
                              },
                              {} as GraphQLFieldConfigArgumentMap,
                          )
                        : undefined,
                // todo:
                deprecationReason: undefined,
                description: member.doc,
            };
            if (member.name !== '__typename') {
                obj[member.name] = memberType;
            }
            return obj;
        }, fields);
        return gqlType;
    }
    function createGQLUnion(type: Union | UnionLiteral): GraphQLType {
        return new GraphQLUnionType({
            name: type.kind === 'union' ? type.name : 'AnonymousUnion' + ++anonTypeIdx,
            description: type.kind === 'union' ? type.doc : undefined,
            types: type.members.map(member => createGQL(member, false) as GraphQLObjectType),
        });
    }
    function createGQLInputUnion(type: Union | UnionLiteral): GraphQLType {
        if (!type.members.every(m => m.kind === 'primitive' && m.type === 'string'))
            throw new Error('Input union supports only string unions');
        const union = type.members.map(m => m.kind === 'primitive' && m.literal);
        const validate = (val: string) => {
            if (!union.includes(val))
                throw new GraphQLError(`Input union: "${union.join(' | ')}" doesn't have value: ${val}`);
            return val;
        };
        return new GraphQLScalarType({
            name: type.kind === 'union' ? type.name : union.map(u => String(u).replace(/[^a-z]+/gi, '_')).join('__'),
            description: type.kind === 'union' ? type.doc : undefined,
            serialize: validate,
            parseValue: validate,
            parseLiteral(ast: ValueNode) {
                if (ast.kind === Kind.STRING) {
                    return validate(ast.value);
                }
                return null;
            },
        });
    }
    function createGQLPrimitive(type: Primitive): GraphQLType {
        if (type.rawType === 'ID') return GraphQLID;
        const customType = customScalarsMap.get(type.type);
        if (customType) return customType;
        if (customScalar) {
            const res = customScalar(type);
            if (res) return res;
        }
        switch (type.type) {
            case 'number':
                return type.rawType === 'Int' ? GraphQLInt : GraphQLFloat;
            case 'string':
                return GraphQLString;
            case 'boolean':
                return GraphQLBoolean;
        }
        throw new Error('Unexpected type: ' + JSON.stringify(type));
    }

    function createGQLEnum(type: Enum) {
        const values = type.types.reduce((acc, item, index) => {
            if (item.kind !== "primitive") {
                throw new Error(`Only string enum values are supported: ${JSON.stringify(type)}`)
            }
            else {
                if (item.type !== "string") {
                    throw new Error(`Only string enum values are supported: ${JSON.stringify(type)}`)
                }
                acc[item.literal as string] = {value: index}
            }
            return acc;
        }, {} as GraphQLEnumTypeConfig["values"])

        return new GraphQLEnumType({
            name: type.name,
            values
        })
    }
}

function never(never: never): never {
    throw new Error('Never possible');
}
function nonNull<T>(val: T | undefined): T {
    if (val === undefined) throw new Error('Undefined is not expected here');
    return val;
}
