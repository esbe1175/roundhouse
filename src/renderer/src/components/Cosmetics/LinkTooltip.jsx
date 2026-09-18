import ChatTooltip from "../Shared/ChatTooltip";

export default function LinkTooltip({ showLinkInfo, mousePos, linkInfo }) {
  if (!showLinkInfo) return null;
  return (
    <ChatTooltip mousePos={mousePos} className="tooltipItem linkTooltip showTooltip">
      <img
        src={linkInfo?.clipThumbnailUrl}
        alt={linkInfo?.clipTitle}
        className="linkTooltipPreview"
        loading="lazy"
        fetchpriority="low"
        decoding="async"
      />
      <div className="linkTooltipInfo">
        <div className="linkTooltipInfoHeader">
          <h5>Link Title:</h5>
          <span>{linkInfo?.clipTitle}</span>
        </div>
      </div>
    </ChatTooltip>
  );
}
