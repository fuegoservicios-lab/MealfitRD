import json
import sys

try:
    with open('lint_results.json', 'r', encoding='utf-8') as f:
        results = json.load(f)
    for res in results:
        for msg in res.get('messages', []):
            if msg['ruleId'] in ['react-hooks/exhaustive-deps', 'no-unused-vars', 'react-hooks/set-state-in-effect', 'no-empty', 'no-shadow-restricted-names']:
                print(f"{res['filePath']}:{msg['line']} {msg['ruleId']} {msg['message']}")
except Exception as e:
    print("Error:", e)
