# TODOs

## BUGS

- Improve error messages as a general in console log and node.status. 

## Features

- Refactor into seperate modules so it can be used as a seperate lib? [ref](https://github.com/runnane/node-red-contrib-easee/issues/14)
- Add custom useragent in fetch commands to help easee identify source when problems?
- Add UI option to restart login if it has timed out
- Add UI option to print debug messages to node.warn() in addition to console.log/debug? 
- Need to add a flag for debug logging (use nodered coding standards), and wrap all output in a helper so we control where to output and what to output?
- Update signalR constructor to use debugflag only if we have enabled debug in the configuration node

## Chores/Testing

- Fix dependabot and add code owners file
- Use actual functions for testing and not mocking. 
- Add coverage testing and reports
- ✅ Use https://github.com/node-red/node-red-node-test-helper for testing, reducing the need for mocks
