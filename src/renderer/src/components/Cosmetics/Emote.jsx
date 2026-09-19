import { memo, useCallback, useState, useMemo } from "react";
import EmoteTooltip from "./EmoteTooltip";
import { emoteDisplaySize } from "../../../../../utils/emote-layout.mjs";

const Emote = memo(({ emote, overlaidEmotes = [], scale = 1, type }) => {
  const { id, name, width, height } = emote;

  const [showEmoteInfo, setShowEmoteInfo] = useState(false);
  const [mousePos, setMousePos] = useState({ x: null, y: null });
  const [naturalSize, setNaturalSize] = useState(null);
  const displaySize = useMemo(
    () =>
      type === "stv"
        ? emoteDisplaySize(width, height, naturalSize?.width, naturalSize?.height, scale)
        : { width: 32, height: 32 },
    [height, naturalSize?.height, naturalSize?.width, scale, type, width],
  );

  const emoteSrcSet = useCallback(
    (emote) => {
      if (type === "stv") {
        const baseUrl = `https://cdn.7tv.app/emote/${emote.id}`;
        return `${baseUrl}/1x.webp 1x, ${baseUrl}/2x.webp 2x, ${baseUrl}/3x.webp 3x, ${baseUrl}/4x.webp 4x`;
      }
      return `https://files.kick.com/emotes/${emote.id}/fullsize`;
    },
    [type],
  );

  const emoteImageSrc = useMemo(() => {
    return type === "stv" ? `https://cdn.7tv.app/emote/${id}/1x.webp` : `https://files.kick.com/emotes/${id}/fullsize`;
  }, [type, id]);

  // Optimize event handlers with useCallback
  const handleMouseEnter = useCallback((e) => {
    setMousePos({ x: e.clientX, y: e.clientY });
    setShowEmoteInfo(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setShowEmoteInfo(false);
  }, []);

  const handleMouseMove = useCallback(
    (e) => {
      if (showEmoteInfo) {
        setMousePos({ x: e.clientX, y: e.clientY });
      }
    },
    [showEmoteInfo],
  );

  return (
    <>
      <EmoteTooltip
        type={type}
        showEmoteInfo={showEmoteInfo}
        emoteSrc={emoteImageSrc}
        mousePos={mousePos}
        emoteInfo={emote}
        overlaidEmotes={overlaidEmotes}
      />
      <div
        className="chatroomEmoteWrapper"
        style={{
          width: `${displaySize.width}px`,
          height: `${displaySize.height}px`,
        }}>
        <div
          className="chatroomEmote"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onMouseMove={handleMouseMove}>
          <img
            className={type === "stv" ? "stvEmote emote" : "kickEmote emote"}
            src={emoteImageSrc}
            srcSet={type === "stv" ? emoteSrcSet(emote) : null}
            alt={name}
            loading="lazy"
            fetchpriority="low"
            decoding="async"
            onLoad={(event) => {
              const image = event.currentTarget;
              if (image.naturalWidth > 0 && image.naturalHeight > 0)
                setNaturalSize((current) =>
                  current?.width === image.naturalWidth && current?.height === image.naturalHeight
                    ? current
                    : { width: image.naturalWidth, height: image.naturalHeight },
                );
            }}
          />
        </div>

        {/* Overlaid zero-width emotes */}
        {overlaidEmotes.map((overlaidEmote) => (
          <div key={overlaidEmote.id} className="chatroomEmote zeroWidthEmote">
            <img
              className={`${type === "stv" ? "stvEmote" : "kickEmote"} emote`}
              src={
                type === "stv"
                  ? `https://cdn.7tv.app/emote/${overlaidEmote.id}/1x.webp`
                  : `https://files.kick.com/emotes/${overlaidEmote.id}/fullsize`
              }
              alt={` ${overlaidEmote.name}`}
              loading="lazy"
              decoding="async"
            />
          </div>
        ))}
      </div>
    </>
  );
});

export default Emote;
