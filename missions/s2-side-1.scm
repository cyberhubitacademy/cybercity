; =====================================================================
; Season 2 side mission: "Night Shift"
; Dex needs help triaging a 3 AM alert queue at the Harbor SOC.
; Teaches: alert triage, false positives, enrichment, handoffs.
; =====================================================================
SCRIPT_START s2_side_1_nightshift

LOCAL passed = FALSE
LOCAL blip = 0

MUSIC_CUE "stealth"
SET_OBJECTIVE "Go to the Harbor SOC."
ADD_BLIP "soc" "cyan" -> blip
SET_WAYPOINT "soc"
WHILE NOT IS_PLAYER_AT "soc" 12.0
    WAIT 250
END_WHILE
REMOVE_BLIP blip
CLEAR_WAYPOINT

shift:
SET_OBJECTIVE "Work the night shift on the SOC console."
START_CHALLENGE "soc-1" "soc-terminal" -> passed
IF NOT passed
    PRINT_HELP "Some alerts slipped past. Enrich before deciding, then try the SOC console again."
    GOTO shift
END_IF

MUSIC_CUE "triumph"
SHOW_DIALOGUE "s2.dex_done"
MISSION_COMPLETE
SCRIPT_END
