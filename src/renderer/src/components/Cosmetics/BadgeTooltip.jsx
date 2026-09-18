import ChatTooltip from "../Shared/ChatTooltip";

export default function BadgeTooltip({ showBadgeInfo, mousePos, badgeInfo }) {
  if (!showBadgeInfo) return null;
  return (
    <ChatTooltip mousePos={mousePos} className="tooltipItem showTooltip">
      <img src={badgeInfo?.src} alt={badgeInfo?.title} />
      <div className="tooltipItemInfo">
        <span>{badgeInfo?.title}</span>
        <span className="badgeTooltipPlatform">{badgeInfo?.platform}</span>
      </div>
      {badgeInfo?.owner?.username && (
        <span className="tooltipItemCreatedBy">
          Created by <span className="tooltipItemCreatedByUsername">{badgeInfo.owner.username}</span>
        </span>
      )}
    </ChatTooltip>
  );
}
