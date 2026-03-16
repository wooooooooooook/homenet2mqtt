import re

with open('packages/ui/src/lib/components/Sidebar.svelte', 'r') as f:
    content = f.read()

# Add isSetupMode to props
props_replacement = """  let {
    activeView = $bindable<'dashboard' | 'analysis' | 'gallery' | 'settings'>('dashboard'),
    isOpen = false,
    isSetupMode = false,
    onClose,
  }: {
    activeView: 'dashboard' | 'analysis' | 'gallery' | 'settings';
    isOpen?: boolean;
    isSetupMode?: boolean;
    onClose?: () => void;
  } = $props();"""
content = re.sub(r"  let \{\n    activeView = \$bindable<'dashboard' \| 'analysis' \| 'gallery' \| 'settings'>\('dashboard'\),\n    isOpen = false,\n    onClose,\n  \}: \{\n    activeView: 'dashboard' \| 'analysis' \| 'gallery' \| 'settings';\n    isOpen\?: boolean;\n    onClose\?: \(\) => void;\n  \} = \$props\(\);", props_replacement, content)

# Add disabled={isSetupMode} to buttons
content = content.replace("class=\"nav-item\"", "class=\"nav-item\" disabled={isSetupMode}")
# Except we replaced a inside .nav-item too, let's fix that
content = content.replace("<a\n      class=\"nav-item\" disabled={isSetupMode}", "<a\n      class=\"nav-item\"")

# Add CSS for disabled state
css_replacement = """.nav-item:focus-visible {
    background: rgba(148, 163, 184, 0.1);
    color: #e2e8f0;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5);
  }

  .nav-item:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: transparent;
    color: #94a3b8;
  }

  .nav-item:disabled:hover {
    background: transparent;
    color: #94a3b8;
  }

  .nav-item.active {"""

content = content.replace(".nav-item:focus-visible {\n    background: rgba(148, 163, 184, 0.1);\n    color: #e2e8f0;\n    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5);\n  }\n\n  .nav-item.active {", css_replacement)

with open('packages/ui/src/lib/components/Sidebar.svelte', 'w') as f:
    f.write(content)

print("Patched Sidebar.svelte")
