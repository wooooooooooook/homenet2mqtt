import re

with open('packages/ui/src/App.svelte', 'r') as f:
    content = f.read()

# Add isSetupMode computed property
is_setup_mode_code = """
  let bridgeInfo = $state<BridgeInfo | null>(null);
  let isSetupMode = $derived.by(() => bridgeInfo?.error === 'CONFIG_INITIALIZATION_REQUIRED' || bridgeInfo?.restartRequired === true);
"""
content = content.replace("  let bridgeInfo = $state<BridgeInfo | null>(null);", is_setup_mode_code)

# Add isSetupMode to Sidebar
sidebar_replacement = """      <Sidebar bind:activeView isOpen={isSidebarOpen} onClose={() => (isSidebarOpen = false)} {isSetupMode} />"""
content = re.sub(r"      <Sidebar bind:activeView isOpen=\{isSidebarOpen\} onClose=\{[^}]+\} />", sidebar_replacement, content)

with open('packages/ui/src/App.svelte', 'w') as f:
    f.write(content)

print("Patched App.svelte")
