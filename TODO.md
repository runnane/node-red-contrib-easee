# TODOs

## BUGS

- Add button in config node to reauth or check auth
- Improve error messages as a general in console log and node.status. 
- ✅ ~~possible bug, we seem to log in twice? Token expiration timing shows negative values~~ - COMPLETED: Fixed double login issue by implementing authentication mutex to prevent concurrent checkToken() calls

## Features

- Refactor into seperate modules so it can be used as a seperate lib? [ref](https://github.com/runnane/node-red-contrib-easee/issues/14)
- Add custom useragent in fetch commands to help easee identify source when problems?
- Add UI option to restart login if it has timed out
- Add UI option to print debug messages to node.warn() in addition to console.log/debug? Need to add a flag for debug logging (use nodered coding standards), and wrap all output in a helper fn?
## Chores/Testing

- Fix dependabot and add code owners file
- Use actual functions for testing and not mocking. 
- Add coverage testing and reports
