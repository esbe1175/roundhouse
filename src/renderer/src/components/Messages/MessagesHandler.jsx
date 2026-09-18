import { memo, useMemo, useEffect, useState, useRef, useCallback } from "react";
import { Virtuoso } from "react-virtuoso";
import useChatFollow from "./useChatFollow";
import Message from "./Message";
import MouseScroll from "../../assets/icons/mouse-scroll-fill.svg?asset";
import { FilterSession } from "../../../../../utils/chat-filters.mjs";

const MessagesHandler = memo(
  ({
    messages,
    chatroomId,
    slug,
    allStvEmotes,
    subscriberBadges,
    kickTalkBadges,
    settings,
    userChatroomInfo,
    username,
    userId,
    donators,
  }) => {
    const virtuosoRef = useRef(null);
    const chatContainerRef = useRef(null);
    const [silencedUserIds, setSilencedUserIds] = useState(new Set());
    const filters = useRef({ room: chatroomId, session: new FilterSession() });

    const filteredMessages = useMemo(() => {
      if (!messages?.length) return [];

      if (filters.current.room !== chatroomId) filters.current = { room: chatroomId, session: new FilterSession() };
      const visible = messages.filter((message) => {
        if (message?.chatroom_id != chatroomId) return false;
        if (message?.type === "mod_action") return !!settings?.chatrooms?.showModActions;
        if (message?.type === "system") return true;
        if (message?.type !== "reply" && message?.type !== "message") return true;

        return message?.sender?.id && !silencedUserIds.has(message?.sender?.id);
      });
      return filters.current.session.apply(visible, settings?.chatFilters, allStvEmotes);
    }, [
      messages,
      chatroomId,
      silencedUserIds,
      settings?.chatFilters,
      settings?.chatrooms?.showModActions,
      allStvEmotes,
    ]);

    const follow = useChatFollow(chatroomId, filteredMessages, virtuosoRef);

    const itemContent = useCallback(
      (index, message) => {
        return (
          <div
            className={message.filterReason ? "rh-filtered-message" : undefined}
            data-filter-reason={message.filterReason || undefined}
            title={message.filterReason ? `Filtered: ${message.filterReason}` : undefined}
          >
            <Message
              key={message?.id}
              data-message-id={message.id}
              message={message}
              chatroomId={chatroomId}
              chatroomName={slug}
              subscriberBadges={subscriberBadges}
              allStvEmotes={allStvEmotes}
              existingKickTalkBadges={kickTalkBadges}
              settings={settings}
              userChatroomInfo={userChatroomInfo}
              username={username}
              userId={userId}
              donators={donators}
            />
          </div>
        );
      },
      [
        chatroomId,
        slug,
        subscriberBadges,
        allStvEmotes,
        kickTalkBadges,
        settings,
        userChatroomInfo,
        username,
        userId,
        donators,
      ],
    );

    useEffect(() => {
      const loadSilencedUsers = () => {
        try {
          const storedUsers = JSON.parse(localStorage.getItem("silencedUsers") || "{}");
          const userIds = storedUsers?.data?.map((user) => user.id) || [];
          setSilencedUserIds(new Set(userIds));
        } catch (error) {
          console.error("[MessagesHandler]: Error loading silenced users:", error);
          setSilencedUserIds(new Set());
        }
      };

      const handleStorageChange = (e) => {
        if (e.key === "silencedUsers") {
          loadSilencedUsers();
        }
      };

      loadSilencedUsers();
      window.addEventListener("storage", handleStorageChange);

      return () => {
        window.removeEventListener("storage", handleStorageChange);
      };
    }, []);

    const computeItemKey = useCallback(
      (index, message) => {
        return `${message?.id || index}-${chatroomId}`;
      },
      [chatroomId],
    );

    return (
      <div
        className="chatContainer"
        style={{ height: "100%", flex: 1 }}
        ref={chatContainerRef}
        data-chatroom-id={chatroomId}
      >
        <Virtuoso
          ref={virtuosoRef}
          data={filteredMessages}
          itemContent={itemContent}
          computeItemKey={computeItemKey}
          scrollerRef={follow.scrollerRef}
          followOutput={follow.followOutput}
          totalListHeightChanged={follow.pin}
          initialTopMostItemIndex={{ index: Math.max(0, filteredMessages.length - 1), align: "end" }}
          atBottomThreshold={6}
          overscan={50}
          increaseViewportBy={400}
          defaultItemHeight={50}
          style={{
            height: "100%",
            width: "100%",
            flex: 1,
          }}
        />

        {follow.paused && (
          <button type="button" className="scrollToBottomBtn" onClick={follow.resume}>
            Scroll To Bottom
            <img src={MouseScroll} width={24} height={24} alt="" />
          </button>
        )}
      </div>
    );
  },
);

MessagesHandler.displayName = "MessagesHandler";

export default MessagesHandler;
