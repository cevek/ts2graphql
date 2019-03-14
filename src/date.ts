import {GraphQLScalarType, Kind, GraphQLError} from 'graphql';

export const DateType = new GraphQLScalarType({
    name: 'Date',
    serialize: date => {
        if (Number.isNaN(date.getTime())) {
            throw new Error('Invalid response date');
        }
        return date.toJSON();
    },
    parseValue: val => {
        return parse(val);
    },
    parseLiteral(ast) {
        if (ast.kind === Kind.STRING) {
            return parse(ast.value);
        }
        return null;
    },
});

function parse(val: string) {
    const date = new Date(val);
    if (val.length !== 24 || Number.isNaN(date.getTime())) {
        throw new GraphQLError('Incorrect Date: ' + val);
    }
    return date;
}
