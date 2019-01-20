import { GraphQLScalarType, Kind } from 'graphql';

export const DateType = new GraphQLScalarType({
    name: 'Date',
    serialize: val => val.toJSON(),
    parseValue: val => new Date(val),
    parseLiteral(ast) {
        if (ast.kind === Kind.STRING) {
            return new Date(ast.value);
        }
        return null;
    },
});
