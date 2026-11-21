import {createContext} from 'react';
import type {ProjectVariable} from '@/lib/projectVariables';
import type {WorkplaneShape} from '@/types/layerling';
export const ProjectVariablesContext=createContext<{
 variables:ProjectVariable[];shape?:WorkplaneShape;allowPosition?:boolean;
 bind?:(id:string,field:string,expression:string)=>void;
 open?:()=>void;
}>({variables:[]});
