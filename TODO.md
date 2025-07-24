# TODOs

## BUGS

- If tries are used up for auth or token renew, state this clearly in the node status text, and in warning. Should probably warn in log that we have backed off every x minutes?
- Improve error messages as a general in log and node.status. 
- Add debug/logging prefix to show that they are originating from this lib
- Do not accept account without username/password

## Features

- Refactor into seperate modules so it can be used as a seperate lib? [ref](https://github.com/runnane/node-red-contrib-easee/issues/14)

## Chores/Testing

- Fix dependabot and add code owners file
- Use actual functions for testing and not mcking. 
