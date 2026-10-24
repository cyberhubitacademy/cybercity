; =====================================================================
; Season 3, Mission 6: "Inside Job" (Season 3 finale)
; A Black Lotus crew holds Palmetto Bank staff hostage. Someone inside
; gave them a working badge. Teaches: de-escalation, insider threat, badge
; revocation and access reviews, incident response for physical breaches.
; Gameplay: negotiate (or fight), clear the bank, run incident response.
; =====================================================================
SCRIPT_START s3_06_inside_job

LOCAL crew = 0
LOCAL calm = FALSE
LOCAL passed = FALSE

START_THREAD watchdog

CINEMATIC_START
SET_WEATHER "rain"
MUSIC_CUE "villain"
CAMERA_SHOT "skyline" "city" 3000
SHOW_TITLE "Inside Job" "Season 3 finale: Palmetto Bank" 3500
SHOW_DIALOGUE "s3.s3e6_open"
CAMERA_SHOT "establish" "bank" 3000
SHOW_DIALOGUE "s3.marisol_brief"
CINEMATIC_END

TELEPORT_PLAYER 20.0 -89.0
SPAWN_ENEMY_GROUP "hostage_taker" "bank" 3 -> crew
GIVE_WEAPON "pistol" 36
GIVE_WEAPON "armor" 0
PRINT_HELP "Sergeant Reyes holds the perimeter. Walk up slowly. Keep your weapon holstered (X) while you talk."

MUSIC_CUE "tension"
SET_OBJECTIVE "Approach the bank entrance and open negotiations."
WHILE NOT IS_PLAYER_AT "bank" 14.0
    WAIT 250
END_WHILE

NEGOTIATE "bank" -> calm
IF calm
    MUSIC_CUE "hope"
    SHOW_DIALOGUE "s3.s3e6_surrender"
    SET_OBJECTIVE "They surrendered. Zip-tie the suspects (E) or let Reyes take them."
    WAIT 6000
ELSE
    MUSIC_CUE "action"
    SET_ENEMY_TARGET crew
    SET_OBJECTIVE "Talks broke down. Take cover and stop the gunmen. Mind the hostages."
    WAIT_ENEMIES_CLEARED crew
END_IF
SHOW_DIALOGUE "s3.s3e6_badge"

respond:
MUSIC_CUE "stealth"
SET_OBJECTIVE "Run incident response on the physical breach at the bank help desk."
START_CHALLENGE "incident-1" "bank-terminal" -> passed
IF NOT passed
    PRINT_HELP "The response plan has gaps. Use the feedback and try the help desk again."
    GOTO respond
END_IF

CINEMATIC_START
SET_WEATHER "clear"
MUSIC_CUE "triumph"
SHOW_DIALOGUE "s3.s3e6_insider"
CAMERA_SHOT "establish" "bank" 3000
SHOW_DIALOGUE "s3.marisol_done"
SHOW_DIALOGUE "s3.s3e6_epilogue"
CINEMATIC_END
MUSIC_CUE "none"
MISSION_COMPLETE
SCRIPT_END

watchdog:
WHILE TRUE
    WAIT 500
    IF IS_PLAYER_DEAD
        MISSION_FAILED "You were hospitalized."
    END_IF
END_WHILE
