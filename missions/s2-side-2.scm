; =====================================================================
; Season 2 side mission: "Zero Trust Tour"
; NOVA explains zero trust while you rebuild the data center rules.
; Teaches: never trust, always verify; least privilege; segmentation.
; =====================================================================
SCRIPT_START s2_side_2_zerotrust

LOCAL passed = FALSE
LOCAL blip = 0

MUSIC_CUE "calm"
SET_OBJECTIVE "Go to the Harbor Cloud data center."
ADD_BLIP "datacenter" "cyan" -> blip
SET_WAYPOINT "datacenter"
WHILE NOT IS_PLAYER_AT "datacenter" 12.0
    WAIT 250
END_WHILE
REMOVE_BLIP blip
CLEAR_WAYPOINT

rules:
SET_OBJECTIVE "Rebuild the data center rules with zero trust."
START_CHALLENGE "firewall-1" "dc-terminal" -> passed
IF NOT passed
    PRINT_HELP "Something still trusts too much. Allow only what each tier needs, deny the rest, and try again."
    GOTO rules
END_IF

MUSIC_CUE "hope"
SHOW_DIALOGUE "s2.nova_done"
MISSION_COMPLETE
SCRIPT_END
