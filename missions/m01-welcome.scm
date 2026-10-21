; =====================================================================
; Mission 1 — "Welcome to Neon Bay"
; Rico Vega steps off the bus on Ocean Drive. Max calls: get to HQ.
; Teaches movement, the GPS waypoint and talking to characters.
; =====================================================================
SCRIPT_START m01_welcome

LOCAL hqBlip = 0

SHOW_DIALOGUE "m01.intro_call"
PRINT_HELP "Move with W A S D. Hold SHIFT to sprint. Drag or click the mouse to look around."

SET_OBJECTIVE "Walk to Sunset Shield HQ on Ocean Drive."
ADD_BLIP "hq" "pink" -> hqBlip
SET_WAYPOINT "hq"

WAIT 4000
PRINT_HELP "Follow the pink route on the minimap. Press M for the full map."

WHILE NOT IS_PLAYER_AT "hq" 10.0
    WAIT 250
END_WHILE

REMOVE_BLIP hqBlip
CLEAR_WAYPOINT
SET_OBJECTIVE "Talk to Max Cortez in the lobby."
PRINT_HELP "Walk up to Max and press E to talk."
WAIT_FOR_TALK "max"
SHOW_DIALOGUE "m01.max_welcome"

PRINT_HELP "Press TAB any time to see your missions. Cyber terminals glow cyan: press E to use one."
UNLOCK_NOTE "New contact: Max Cortez (Sunset Shield)"
MISSION_COMPLETE
SCRIPT_END
