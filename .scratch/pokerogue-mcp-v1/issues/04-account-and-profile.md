# Throwaway account and persistent Chrome profile

Type: task
Status: open

## Question

Nothing downstream can be tested against a real run until there is a logged-in session. pokerogue.net has no guest mode: the start screen offers only `Login` / `Register`, and registration needs no email.

This ticket is done when:

- A persistent Chrome profile directory exists at a known path outside the repo, reserved for this project.
- Chrome has been launched against that profile with `--remote-debugging-port`, and the exact command is written down.
- One throwaway PokéRogue account (random username, random password, no email) has been registered through that profile, and a new run has been started at least once by hand.
- The session survives a full Chrome restart against the same profile — verified, not assumed.
- The credentials are stored somewhere outside the repo and the location is noted in the answer. They are never committed and never read by the server.

The answer records: the profile path, the launch command, the debug port, and confirmation that login persists.

Non-goal: more than one account. Account farming is explicitly out of scope.
