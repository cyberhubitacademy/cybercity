; =====================================================================
; Mission 4 — "Walls of the Harbor"
; Harbor Cloud's firewall lets the whole internet in. Fix the rules.
; =====================================================================
SCRIPT_START m04_walls

LOCAL blip = 0
LOCAL passed = FALSE

SET_OBJECTIVE "Go to the Harbor Cloud data center."
ADD_BLIP "datacenter" "cyan" -> blip
SET_WAYPOINT "datacenter"

WHILE NOT IS_PLAYER_AT "datacenter" 12.0
    WAIT 250
END_WHILE

REMOVE_BLIP blip
CLEAR_WAYPOINT
SET_OBJECTIVE "Talk to Tito Ramos."
WAIT_FOR_TALK "tito"
SHOW_DIALOGUE "m04.tito_brief"

rules:
SET_OBJECTIVE "Rebuild the firewall rules at the data center console."
START_CHALLENGE "firewall-1" "dc-terminal" -> passed
IF NOT passed
    PRINT_HELP "Run the traffic simulation and look at which rule matched first. Order matters!"
    GOTO rules
END_IF

SHOW_DIALOGUE "m04.tito_done"
MISSION_COMPLETE
SCRIPT_END
