import { IActionProcessor } from "../../types";
export declare class ActionHandlerFactory {
    private static processors;
    static getProcessor(actionType: string): IActionProcessor | null;
    static addProcessor(actionType: string, processor: IActionProcessor): void;
}
