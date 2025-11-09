#!/bin/bash

# Add overflow_data notice to all agent system prompts
# This script updates agent files to include overflow_data documentation

echo "Adding overflow_data field documentation to all agents..."

cat > /tmp/overflow_snippet.txt << 'EOF'

IMPORTANT: Your JSON output includes an "overflow_data" field.
Use this field for ANY insights, observations, or context that you believe is important
but doesn't fit into the structured fields above. Other agents will have access to this data.
EOF

echo "Manual updates required for each agent..."
echo "- Add overflow_data to JSON schema examples"
echo "- Pass parsed.overflow_data to createResponse"
