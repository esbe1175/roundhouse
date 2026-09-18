import dayjs from "dayjs";
import ChatTooltip from "../Shared/ChatTooltip";

export default function EmoteTooltip({ showEmoteInfo, mousePos, emoteInfo, type, emoteSrc, overlaidEmotes = [] }) {
  if (!showEmoteInfo || !emoteInfo) return null;
  return (
    <ChatTooltip mousePos={mousePos} className="tooltipItem emoteTooltip">
      <div style={{ position: "relative", display: "flex" }}>
        <img
          src={emoteSrc}
          className={type === "stv" ? "stvEmote emote " : "kickEmote emote "}
          width={"100%"}
          height={64}
          loading="lazy"
          fetchpriority="low"
          decoding="async"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      </div>

      {
        <div className="emoteTooltipInfo">
          <div className="emoteTooltipInfoHeader">
            <span>{emoteInfo?.name}</span>
            <p>
              {emoteInfo?.alias && <span>Alias of {emoteInfo.alias}</span>}
              <span className="emoteTooltipPlatform">{emoteInfo?.platform === "7tv" ? "7TV" : "Kick"}</span>
            </p>
          </div>

          {/* Show overlaid emotes info */}

          {overlaidEmotes.length > 0 && (
            <div className="emoteTooltipOverlaidWrapper">
              <h5>Zero-Width</h5>

              {overlaidEmotes.length > 0 && (
                <div className="emoteTooltipOverlaidItems">
                  {overlaidEmotes.map((overlaidEmote, index) => (
                    <div key={`${overlaidEmote.id}-${index}`} className="emoteTooltipOverlaidItem">
                      <img src={`https://cdn.7tv.app/emote/${overlaidEmote.id}/1x.webp`} alt={overlaidEmote.name} />
                      {/* <span>{overlaidEmote.name}</span> */}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {type === "stv" && emoteInfo?.owner?.username && (
            <p>
              Made by <span>{emoteInfo.owner.username}</span>
            </p>
          )}

          {type === "stv" && emoteInfo?.owner?.username && (
            <p>
              Added on <span>{dayjs(emoteInfo.added_timestamp).format("MMM D, YYYY")}</span>
            </p>
          )}
        </div>
      }
    </ChatTooltip>
  );
}
