# TODOs

## BUGS

- Improve error messages as a general in console log and node.status. 

## Features

- Add custom useragent in fetch commands to help easee identify source when problems?
- Add UI option to restart login if it has timed out
- Need to add a flag for debug logging (use nodered coding standards), and wrap all output in a helper so we control where to output and what to output?
- Update signalR constructor to use debugflag only if we have enabled debug in the configuration node

## Chores/Testing

- Fix dependabot and add code owners file
- Use actual functions for testing and not mocking. 
- Add coverage testing and reports
- ✅ Use https://github.com/node-red/node-red-node-test-helper for testing, reducing the need for mocks
