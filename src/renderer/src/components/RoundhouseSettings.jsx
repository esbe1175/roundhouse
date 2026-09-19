import Gear from "../assets/icons/gear-fill.svg?asset";
import { Slider } from "./Shared/Slider";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "./Shared/Dropdown";

export default function RoundhouseSettings({
  enabled,
  intensity,
  falloff,
  onChange,
  onIntensity,
  onFalloff,
  onReset,
  onOpenChange,
}) {
  return (
    <DropdownMenu modal={false} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button className="rh-icon-control" aria-label="Roundhouse settings" title="Roundhouse settings">
          <img src={Gear} width={18} height={18} alt="" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="rh-settings-menu rh-native-overlay" side="top" align="end" collisionPadding={8}>
        <DropdownMenuLabel>Roundhouse settings</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          aria-label="Ambient glow"
          className="dropdownMenuItem"
          checked={enabled}
          onCheckedChange={onChange}
          onSelect={(event) => event.preventDefault()}
        >
          Ambient glow
        </DropdownMenuCheckboxItem>
        <p>Soft stream colors in the black bars. Samples every three seconds while playing.</p>
        {[
          { name: "Intensity", value: intensity, change: onIntensity, text: `${intensity}%` },
          { name: "Distance falloff", value: falloff, change: onFalloff, text: falloff ? `${falloff}%` : "Unfaded" },
        ].map(({ name, value, change, text }) => (
          <DropdownMenuItem key={name} asChild onSelect={(event) => event.preventDefault()}>
            <div
              className="rh-settings-range"
              onFocus={(event) => {
                if (event.target === event.currentTarget) event.currentTarget.querySelector('[role="slider"]')?.focus();
              }}
            >
              <div>
                <span>{name}</span>
                <span>{text}</span>
              </div>
              <Slider
                className="rh-settings-slider"
                thumbLabel={name}
                value={[value]}
                min={0}
                max={100}
                step={1}
                disabled={!enabled}
                onValueChange={([next]) => change(next)}
                onKeyDown={(event) => event.stopPropagation()}
              />
            </div>
          </DropdownMenuItem>
        ))}
        <p>Higher falloff keeps the glow closer to the video. Set to zero for no fading.</p>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="dropdownMenuItem"
          onSelect={(event) => {
            event.preventDefault();
            onReset();
          }}
        >
          Reset to defaults
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
