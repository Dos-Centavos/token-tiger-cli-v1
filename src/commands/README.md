# Commands

All commands should follow the same structure:

- async **run()** is the primary execution function. This function should always include a try/catch handler to report errors.
- **validateFlags()** should run first and perform input validation on input flags.
- Constructor: assign external modules to **this** for testability; **this.run = this.run.bind(this)** (and bind other entry points).
