#!/bin/bash

# Get the current directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd $DIR/..

# Build the p2p-node
cd ../node
pnpm build

# Copy the built file to the SDK
cd ../duck-agents
cp ../node/dist/p2p-node.js ./sdk/p2p-node.js

# Update the version in package.json
P2P_VERSION=$(node -p "require('../node/package.json').version")
sed -i "s/\"p2pNodeVersion\": \".*\"/\"p2pNodeVersion\": \"$P2P_VERSION\"/" ./sdk/package.json

echo "Updated p2p-node to version $P2P_VERSION" 