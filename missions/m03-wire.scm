; =====================================================================
; Mission 3 — "Something on the Wire"
; The Harbor SOC sees odd traffic. Dex needs another pair of eyes.
; =====================================================================
SCRIPT_START m03_wire

LOCAL blip = 0
LOCAL passed = FALSE

SET_OBJECTIVE "Head to the Harbor SOC in Silicon Harbor."
ADD_BLIP "soc" "cyan" -> blip
SET_WAYPOINT "soc"
PRINT_HELP "Long trip? Grab a parked car: walk up to it and press E."

WHILE NOT IS_PLAYER_AT "soc" 12.0
    WAIT 250
END_WHILE

REMOVE_BLIP blip
CLEAR_WAYPOINT
SET_OBJECTIVE "Talk to Dex Holloway."
WAIT_FOR_TALK "dex"
SHOW_DIALOGUE "m03.dex_brief"

console:
SET_OBJECTIVE "Investigate the connection log at the SOC console."
START_CHALLENGE "traffic-1" "soc-terminal" -> passed
IF NOT passed
    PRINT_HELP "Some anomalies slipped through. Check the cheat sheet of common ports and try again."
    GOTO console
END_IF

SHOW_DIALOGUE "m03.dex_done"
MISSION_COMPLETE
SCRIPT_END
