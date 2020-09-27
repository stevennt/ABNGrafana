import { QueryDictionary } from "./queryDictionary";
export declare class QueryParam {
    table: string;
    column: any[];
    where: string[];
    temporal_field: any;
    temporal_range: number[];
    grouping: string[];
    conflation: any;
    query: QueryDictionary;
    maxRowCount: number;
}
