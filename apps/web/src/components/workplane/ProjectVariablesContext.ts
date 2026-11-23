import {createContext} from 'react';
import type {ProjectVariable} from '@/lib/projectVariables';
import type {WorkplaneShape} from '@/types/layerling';
export const ProjectVariablesContext=createContext<{
 objects?:WorkplaneShape[];
 relateElevation?:(id:string,parentId:string|null,offset:string,axis?:import('@/lib/objectRelationships').RelationshipAxis)=>void;
 variables:ProjectVariable[];shape?:WorkplaneShape;allowPosition?:boolean;
 bind?:(id:string,field:string,expression:string)=>void;
 open?:()=>void;
 inspectDependencies?:()=>void;
 dependenciesOpen?:boolean;
}>({variables:[]});
