"use client";

import { forwardRef, useState, useEffect, useCallback } from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./Tooltip";
import clsx from "clsx";
import { useDebounceCallback } from "../../utils/hooks";

const initialValue = [0];
const Slider = forwardRef(
  ({ className, thumbLabel, showTooltip = false, defaultValue = initialValue, ...props }, ref) => {
    const [value, setValue] = useState(defaultValue);
    const [showTooltipState, setShowTooltipState] = useState(false);

    useEffect(() => {
      setValue(defaultValue);
    }, [defaultValue]);

    const handlePointerDown = () => {
      setShowTooltipState(true);
    };

    const handlePointerUp = () => {
      setShowTooltipState(false);
    };

    const debouncedHandleValueChange = useDebounceCallback(props.onValueChange, 300);

    const handleValueChange = useCallback(
      (newValue) => {
        setValue(newValue);
        debouncedHandleValueChange(newValue);
      },
      [debouncedHandleValueChange],
    );

    useEffect(() => {
      document.addEventListener("pointerup", handlePointerUp);
      return () => {
        document.removeEventListener("pointerup", handlePointerUp);
      };
    }, []);

    return (
      <SliderPrimitive.Root
        ref={ref}
        className={clsx("sliderRoot", className)}
        value={value}
        onValueChange={handleValueChange}
        onPointerDown={handlePointerDown}
        {...props}
      >
        <SliderPrimitive.Track className="sliderTrack">
          <SliderPrimitive.Range className="sliderRange" />
        </SliderPrimitive.Track>
        <TooltipProvider>
          <Tooltip open={showTooltip && showTooltipState}>
            <TooltipTrigger asChild>
              <SliderPrimitive.Thumb
                aria-label={thumbLabel}
                className={clsx("sliderThumb", className)}
                onMouseEnter={() => setShowTooltipState(true)}
                onMouseLeave={() => setShowTooltipState(false)}
              />
            </TooltipTrigger>
            <TooltipContent>
              <p>{(props.value ?? value)[0]}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </SliderPrimitive.Root>
    );
  },
);

Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
