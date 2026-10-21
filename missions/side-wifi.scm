; =====================================================================
; Side mission — "Rogue Waves"
; Fake "FreeBeachWiFi" hotspots (evil twins) are harvesting logins on
; Neon Beach. Find and scan all four before the clock runs out.
; =====================================================================
SCRIPT_START side_wifi

LOCAL blip = 0
LOCAL found = FALSE
LOCAL tries = 0

SET_OBJECTIVE "Meet Priya at the Byte Bazaar."
ADD_BLIP "market" "yellow" -> blip
SET_WAYPOINT "market"

WHILE NOT IS_PLAYER_AT "market" 14.0
    WAIT 250
END_WHILE

REMOVE_BLIP blip
CLEAR_WAYPOINT
WAIT_FOR_TALK "priya"
SHOW_DIALOGUE "side_wifi.priya_brief"

hunt:
SET tries = tries + 1
SET_OBJECTIVE "Head to Neon Beach and scan the 4 rogue access points."
PRINT_HELP "Your Wi-Fi analyzer beeps faster as you get closer. Press E next to a rogue hotspot to scan it."
COLLECT_START "rogue_aps" 150 -> found
IF NOT found
    IF tries >= 3
        MISSION_FAILED "The rogue hotspots went dark before you found them."
    END_IF
    PRINT_HELP "Time's up! The hotspots moved. Try again: follow the signal meter."
    GOTO hunt
END_IF

SHOW_DIALOGUE "side_wifi.priya_done"
MISSION_COMPLETE
SCRIPT_END
