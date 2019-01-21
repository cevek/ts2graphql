import { GraphQLBoolean, GraphQLFieldConfigArgumentMap, GraphQLFieldConfigMap, GraphQLFloat, GraphQLID, GraphQLInputObjectType, GraphQLInputType, GraphQLInt, GraphQLList, GraphQLNonNull, GraphQLObjectType, GraphQLOutputType, GraphQLScalarType, GraphQLSchema, GraphQLString, GraphQLType, GraphQLUnionType } from 'graphql';
import * as ts from 'typescript';
import { DateType } from './date';
import { extractTypes } from './extractor';
import { AllTypes, InterfaceType, PrimitiveType, UnionType } from './types';

export function createSchema(fileName: string, options: { customScalars?: GraphQLScalarType[] } = {}) {
    const customScalarsMap = new Map<string, GraphQLScalarType>(
        [DateType, ...(options.customScalars || [])].map(it => [it.name, it] as [string, GraphQLScalarType])
    );

    const program = ts.createProgram({ options: { strict: true }, rootNames: [fileName] });
    const sourceFile = program.getSourceFile(fileName)!;
    const types = extractTypes(program)(sourceFile);
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
                return createGQLType(type);
            case 'union':
                return add(type, createGQLUnion(type));
            case 'native':
                if (type.type === 'array') {
                    return new GraphQLList(add(type, nullable(false, createGQL(type.element))));
                }
                throw new Error('Unexpected type: ' + type.type);
            case 'primitive':
                return add(type, createGQLPrimitive(type));
        }
        throw new Error('Unexpected type: ' + type.kind);
    }

    function nullable(nullable: boolean, type: GraphQLType) {
        return nullable ? type : new GraphQLNonNull(type);
    }

    function createGQLType(type: InterfaceType): GraphQLType {
        const isInput = type.name.match(/Input$/);
        const Class = isInput ? (GraphQLInputObjectType as typeof GraphQLObjectType) : GraphQLObjectType;

        const fields = {} as GraphQLFieldConfigMap<{}, {}>;
        let name = type.name;
        if (type.name === 'anonymous') {
            const __typename = type.members.find(member => member.name === '__typename');
            name =
                (__typename && ((__typename.type as PrimitiveType).literal as string)) || 'Anonymous' + ++anonTypeIdx;
        }
        const gqlType = new Class({
            name: name,
            description: type.doc,
            fields: fields,
        });
        add(type, gqlType);
        type.members.reduce((obj, member) => {
            const memberType = {
                type: nullable(member.optional, createGQL(member.type)) as GraphQLOutputType,
                args: member.args
                    ? member.args.reduce(
                          (acc, arg) => {
                              acc[arg.name] = {
                                  description: arg.doc,
                                  defaultValue: arg.defaultValue,
                                  type: nullable(arg.optional, createGQL(arg.type)) as GraphQLInputType,
                              };
                              return acc;
                          },
                          {} as GraphQLFieldConfigArgumentMap
                      )
                    : undefined,
                // todo:
                deprecationReason: undefined,
                description: member.doc,
            };
            obj[member.name] = memberType;
            return obj;
        }, fields);
        return gqlType;
    }
    function createGQLUnion(type: UnionType): GraphQLType {
        return new GraphQLUnionType({
            name: type.name,
            description: type.doc,
            types: type.members.map(member => createGQL(member) as GraphQLObjectType),
        });
    }
    function createGQLPrimitive(type: PrimitiveType): GraphQLType {
        switch (type.type) {
            case 'Float':
            case 'number':
                return GraphQLFloat;
            case 'Int':
                return GraphQLInt;
            case 'ID':
                return GraphQLID;
            case 'string':
                return GraphQLString;
            case 'boolean':
                return GraphQLBoolean;
        }
        const customType = customScalarsMap.get(type.type);
        if (customType) return customType;
        throw new Error('Unexpected type: ' + type.type);
    }
}
