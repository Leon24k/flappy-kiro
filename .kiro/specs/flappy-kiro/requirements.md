# Requirements Document

## Introduction

Flappy Kiro is a browser-based, retro-style endless side-scrolling game inspired by Flappy Bird. The player controls a ghost character that continuously falls due to gravity. By flapping, the player makes the ghost rise, navigating it through gaps in a series of vertically offset pipes that scroll from right to left. The game tracks the player's score based on pipes successfully cleared and ends when the ghost collides with a pipe or the ground. The game runs entirely in a web browser and uses provided sprite and audio assets to deliver a retro arcade experience.

## Glossary

- **Game**: The complete Flappy Kiro application running in a web browser.
- **Ghost**: The player-controlled character sprite (rendered from `assets/ghosty.png`) that the player guides through the game.
- **Pipe_Pair**: A set of two vertically aligned obstacles (one extending from the top, one from the bottom) separated by a vertical Gap.
- **Gap**: The vertical opening between the top and bottom pipe of a Pipe_Pair through which the Ghost must pass.
- **Flap**: A player-initiated input action that applies upward velocity to the Ghost.
- **Gravity**: A constant downward acceleration applied to the Ghost during active gameplay.
- **Score**: A non-negative integer representing the number of Pipe_Pairs the Ghost has successfully passed in the current game session.
- **High_Score**: The highest Score achieved and persisted across game sessions in the same browser.
- **Game_State**: The current mode of the Game, one of: Ready, Playing, or Game_Over.
- **Collision**: An overlap between the Ghost boundary and a pipe boundary or the ground boundary.
- **Play_Area**: The bounded rectangular region in which the Game renders and gameplay occurs.
- **Renderer**: The component responsible for drawing the Game visuals to the browser.
- **Audio_Player**: The component responsible for playing Game sound effects.

## Requirements

### Requirement 1: Game Initialization and Ready State

**User Story:** As a player, I want the game to load and present a clear starting state, so that I understand how to begin playing.

#### Acceptance Criteria

1. WHEN the Game finishes loading in the browser, THE Game SHALL set Game_State to Ready.
2. WHILE Game_State is Ready, THE Renderer SHALL display the Ghost centered vertically within the Play_Area and horizontally at a fixed offset of 25% of the Play_Area width from the left edge, remaining unchanged until Game_State leaves Ready.
3. WHILE Game_State is Ready, THE Renderer SHALL display a visible start instruction message within the Play_Area that names the input action required to begin play.
4. WHILE Game_State is Ready, THE Game SHALL hold the Ghost stationary at its starting position and SHALL NOT apply Gravity.
5. WHEN the Game finishes loading in the browser, THE Game SHALL set Score to 0.
6. IF any required Game asset fails to load within 10 seconds of the browser initiating load, THEN THE Game SHALL remain out of the Ready state and SHALL display an error message indicating that loading failed.

### Requirement 2: Ghost Flap Control

**User Story:** As a player, I want to make the ghost flap upward with an input, so that I can control the ghost's vertical position.

#### Acceptance Criteria

1. WHILE Game_State is Ready, WHEN the player provides a Flap input, THE Game SHALL set Game_State to Playing.
2. WHILE Game_State is Playing, WHEN the player provides a Flap input, THE Game SHALL set the Ghost's vertical velocity to a single fixed upward flap velocity within the range 300 to 600 pixels per second (replacing any prior velocity rather than accumulating).
3. WHILE Game_State is Playing, WHEN the player provides a Flap input, THE Audio_Player SHALL play the sound from `assets/jump.wav`.
4. THE Game SHALL accept a keyboard Spacebar press as a Flap input.
5. THE Game SHALL accept a pointer click or tap within the Play_Area as a Flap input.
6. WHILE Game_State is Playing, IF a Flap input would move the Ghost above the top edge of the Play_Area, THEN THE Game SHALL clamp the Ghost's vertical position to the top edge of the Play_Area.
7. WHILE Game_State is Game_Over, WHEN the player provides a Flap input, THE Game SHALL ignore the input and leave the Ghost's velocity and position unchanged.

### Requirement 3: Gravity and Ghost Movement

**User Story:** As a player, I want the ghost to fall naturally when I do not flap, so that the game presents a continuous challenge.

#### Acceptance Criteria

1. WHILE Game_State is Playing, THE Game SHALL apply Gravity to increase the Ghost downward velocity each frame.
2. WHILE Game_State is Playing, THE Game SHALL limit the Ghost downward velocity to a fixed terminal velocity cap so the downward velocity does not exceed that cap.
3. WHILE Game_State is Playing, THE Game SHALL update the Ghost vertical position based on the Ghost current velocity each frame.
4. WHILE Game_State is Playing, THE Game SHALL clamp the Ghost top so it remains at or below the top boundary of the Play_Area.

### Requirement 4: Pipe Generation and Scrolling

**User Story:** As a player, I want a continuous series of pipes to move toward the ghost, so that the game is an endless scroller.

#### Acceptance Criteria

1. WHILE Game_State is Playing, THE Game SHALL move each Pipe_Pair horizontally from right to left at a constant speed within the range of 100 to 300 pixels per second, using the same speed for all Pipe_Pairs on screen.
2. WHILE Game_State is Playing, THE Game SHALL generate a new Pipe_Pair at the right edge of the Play_Area each time the most recently generated Pipe_Pair has traveled a fixed horizontal spacing of between 150 and 400 pixels from its generation point.
3. WHEN a Pipe_Pair is generated, THE Game SHALL assign the vertical center of the Gap to a randomly selected position no closer than 10 percent of the Play_Area height from the top edge and no closer than 10 percent of the Play_Area height from the bottom edge.
4. WHEN a Pipe_Pair is generated, THE Game SHALL set the Gap height to a fixed value between 20 and 35 percent of the Play_Area height, and this value SHALL be at least 1.5 times the Ghost height so the Ghost can pass through.
5. WHEN a Pipe_Pair's rightmost edge moves past the left edge of the Play_Area, THE Game SHALL remove that Pipe_Pair from the Game within 1 rendered frame.
6. IF a new Pipe_Pair cannot be generated because required Play_Area bounds are unavailable, THEN THE Game SHALL retain the existing Pipe_Pairs unchanged and produce an error indication reporting the generation failure.

### Requirement 5: Scoring

**User Story:** As a player, I want to earn points for passing through pipes, so that I can measure my performance.

#### Acceptance Criteria

1. WHEN the Ghost horizontal position passes the right edge of a Pipe_Pair without Collision, THE Game SHALL increase the Score by exactly 1 and SHALL count each Pipe_Pair no more than once.
2. WHILE Game_State is Playing, THE Renderer SHALL display the current Score as a non-negative integer within the visible bounds of the Play_Area, updating within 100 milliseconds of any Score change.
3. WHEN Game_State changes to Playing from Ready, THE Game SHALL set the Score to 0.
4. THE Game SHALL constrain the Score to a range of 0 to 999999 inclusive, and IF the Score reaches 999999, THEN THE Game SHALL hold the Score at 999999 without further increase.
5. IF the Ghost passes the right edge of a Pipe_Pair that has already been counted, THEN THE Game SHALL retain the current Score without change.

### Requirement 6: Collision Detection and Game Over

**User Story:** As a player, I want the game to end when the ghost hits an obstacle, so that there are clear consequences for failure.

#### Acceptance Criteria

1. WHILE Game_State is Playing, WHEN the Ghost bounding box overlaps the bounding box of any pipe in a Pipe_Pair by 1 or more pixels, THE Game SHALL set Game_State to Game_Over.
2. WHILE Game_State is Playing, WHEN the Ghost bottom edge reaches or crosses the ground boundary of the Play_Area, THE Game SHALL set Game_State to Game_Over.
3. WHEN Game_State changes to Game_Over, THE Audio_Player SHALL play the sound from `assets/game_over.wav`.
4. IF the sound from `assets/game_over.wav` cannot be played when Game_State changes to Game_Over, THEN THE Game SHALL continue the Game_Over transition without audio and remain in Game_Over state.
5. WHEN Game_State changes to Game_Over, THE Game SHALL stop generating new Pipe_Pairs.
6. WHEN Game_State changes to Game_Over, THE Game SHALL stop the horizontal movement of all Pipe_Pairs.
7. WHILE Game_State is Game_Over, IF a subsequent Collision or boundary condition is detected, THEN THE Game SHALL NOT re-trigger the Game_Over transition.

### Requirement 7: Game Over Display and Restart

**User Story:** As a player, I want to see my result and restart quickly after losing, so that I can play again without reloading the page.

#### Acceptance Criteria

1. WHEN Game_State transitions to Game_Over, THE Renderer SHALL display the final Score for the current game session within 200 milliseconds.
2. WHILE Game_State is Game_Over, THE Renderer SHALL display the High_Score.
3. WHILE Game_State is Game_Over, THE Renderer SHALL display a restart instruction as visible text indicating the Flap input restarts the game.
4. WHILE Game_State is Game_Over, WHEN the player provides a Flap input at least 500 milliseconds after Game_State transitioned to Game_Over, THE Game SHALL reset the Ghost to the starting position, reset the current session Score to 0, and set Game_State to Ready.
5. WHILE Game_State is Game_Over, IF the player provides a Flap input less than 500 milliseconds after Game_State transitioned to Game_Over, THEN THE Game SHALL ignore the input and remain in Game_Over.

### Requirement 8: High Score Persistence

**User Story:** As a player, I want my best score to be remembered, so that I can try to beat it in later sessions.

#### Acceptance Criteria

1. WHEN Game_State changes to Game_Over AND the current Score (an integer from 0 to 999999) is greater than the stored High_Score, THE Game SHALL update the High_Score to equal the current Score.
2. WHEN the High_Score is updated, THE Game SHALL persist the High_Score in browser local storage.
3. WHEN the Game finishes loading in the browser, THE Game SHALL load the High_Score from browser local storage.
4. IF no High_Score exists in browser local storage when the Game loads, OR the stored High_Score value is missing, non-numeric, negative, or otherwise cannot be parsed as a valid integer, THEN THE Game SHALL set the High_Score to 0.
5. IF persisting the High_Score to browser local storage fails, THEN THE Game SHALL retain the current High_Score value in the active session and continue gameplay without interruption.

### Requirement 9: Rendering and Retro Presentation

**User Story:** As a player, I want a retro-styled visual presentation, so that the game feels like a classic arcade experience.

#### Acceptance Criteria

1. THE Renderer SHALL render the Ghost using the sprite at `assets/ghosty.png`.
2. WHILE Game_State is Playing, THE Renderer SHALL redraw the Play_Area at a target rate of 60 frames per second, sustaining a measured rate of at least 55 frames per second.
3. WHEN the browser viewport is resized, THE Renderer SHALL render the Play_Area at a fixed 9:16 (width:height) aspect ratio scaled to the largest size that fits entirely within the viewport without cropping and without distorting the aspect ratio.
4. WHILE Game_State is Playing or Game_Over, THE Renderer SHALL render all pipes within the Play_Area.
5. IF the sprite at `assets/ghosty.png` fails to load, THEN THE Renderer SHALL render the Ghost as a solid-colored placeholder shape of equivalent size and continue rendering the Play_Area without interrupting gameplay.

### Requirement 10: Audio Handling

**User Story:** As a player, I want sound effects that respond to my actions, so that the game feels responsive and engaging.

#### Acceptance Criteria

1. WHEN the Game finishes loading in the browser, THE Audio_Player SHALL preload the sounds from `assets/jump.wav` and `assets/game_over.wav` within 5 seconds.
2. IF a sound asset fails to load or does not complete loading within 5 seconds, THEN THE Game SHALL continue gameplay without audio for that sound and SHALL NOT block or delay any gameplay input.
3. WHEN a Flap input occurs and the flap sound is loaded, THE Audio_Player SHALL begin playing the flap sound within 50 milliseconds.
4. WHEN a Flap input triggers the flap sound while that sound is already playing, THE Audio_Player SHALL restart the sound from its beginning.
5. WHEN a collision ends the game and the game-over sound is loaded, THE Audio_Player SHALL begin playing the game-over sound within 50 milliseconds.
