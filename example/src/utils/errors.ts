import { useCallback } from "react";
import { notifications } from "@mantine/notifications";
import { iife } from "./utils";

export const useApiErrorHandler = () => {
  return useCallback((error: any, title?: string) => {
    const message = iife(() => {
      if (error && typeof error === "object") {
        if ("message" in error && typeof error.message === "string") {
          return error.message;
        } else if (
          "error" in error &&
          typeof error.error === "object" &&
          error.error &&
          "message" in error.error &&
          typeof error.error.message === "string"
        ) {
          return error.error.message;
        }
      }
      return "An unexpected error occurred";
    });

    console.error(`APIError${title ? `from ${title}` : ""}: `, message);
    notifications.show({
      title: "Error",
      message,
      color: "red",
    });
  }, []);
};
