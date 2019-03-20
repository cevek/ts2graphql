import {
    GraphQLBoolean,
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
} from 'graphql';
import * as ts from 'typescript';
import {DateType} from './date';
import {typeAST, AllTypes, Interface, Primitive, Union, InterfaceLiteral} from 'ts-type-ast';

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
    // console.log(printSchema(schema));
    return schema;

    function createSchemaFromTypes() {
        let query!: GraphQLObjectType;
        let mutation: GraphQLObjectType | undefined;
        for (let i = 0; i < types.length; i++) {
            const gqlType = createGQL(types[i]);
            if (gqlType instanceof GraphQLObjectType) {
                if (gqlType.name.match(/Query$/)) {
                    query = gqlType;
                }
                if (gqlType.name.match(/Mutation$/)) {
                    mutation = gqlType;
                }
            }
        }
        return new GraphQLSchema({
            query: query,
            mutation: mutation,
        });
    }

    function add(type: AllTypes, gqltype: GraphQLType) {
        map.set(type, gqltype);
        return gqltype;
    }
    function createGQL(type: AllTypes): GraphQLType {
        const gqlType = map.get(type);
        if (gqlType) return gqlType;
        switch (type.kind) {
            case 'interface':
            case 'interfaceLiteral':
                return createGQLType(type);
            // case 'enum':
            // return add(type, createGQLEnum(type));
            case 'union':
                return add(type, createGQLUnion(type));
            case 'array':
                return new GraphQLList(add(type, nullable(false, createGQL(type.element))));
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
        return nullable ? type : new GraphQLNonNull(type);
    }

    function createGQLType(type: Interface | InterfaceLiteral): GraphQLType {
        let typeName = type.kind === 'interface' ? type.name : '';
        const isInput = typeName && typeName.match(/Input$/);
        const Class = isInput ? (GraphQLInputObjectType as typeof GraphQLObjectType) : GraphQLObjectType;

        const fields = {} as GraphQLFieldConfigMap<{}, {}>;
        if (type.kind === 'interfaceLiteral') {
            for (let i = 0; i < type.members.length; i++) {
                const member = type.members[i];
                // console.log(member.name, member.type);
                if (
                    member.name === '__typename' &&
                    member.type.kind === 'primitive' &&
                    typeof member.type.literal === 'string'
                ) {
                    typeName = member.type.literal;
                }
            }
        }
        if (typeName === '') typeName = 'Anonymous' + ++anonTypeIdx;
        const gqlType = new Class({
            name: typeName,
            description: type.kind === 'interface' ? type.doc : undefined,
            fields: fields,
        });
        add(type, gqlType);
        type.members.reduce((obj, member) => {
            const memberType = {
                type: nullable(member.optional, createGQL(member.type)) as GraphQLOutputType,
                args: member.args
                    ? (member.args[0].type as InterfaceLiteral).members.reduce(
                          (acc, arg) => {
                              acc[arg.name] = {
                                  description: arg.doc,
                                  defaultValue: undefined,
                                  type: nullable(arg.optional, createGQL(arg.type)) as GraphQLInputType,
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
    function createGQLUnion(type: Union): GraphQLType {
        return new GraphQLUnionType({
            name: type.name,
            description: type.doc,
            types: type.members.map(member => createGQL(member) as GraphQLObjectType),
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
}

function never(never: never): never {
    throw new Error('Never possible');
}
function nonNull<T>(val: T | undefined): T {
    if (val === undefined) throw new Error('Undefined is not expected here');
    return val;
}
