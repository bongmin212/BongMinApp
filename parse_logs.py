import json
import re

log_file_path = "C:\\Users\\minhp\\.gemini\\antigravity\\brain\\37416b89-cf2a-494b-aaa3-01d2881c3b95\\.system_generated\\steps\\366\\output.txt"

with open(log_file_path, 'r', encoding='utf-8') as f:
    text = f.read()

wrapper = json.loads(text)
result_text = wrapper.get("result", "")

start_idx = result_text.find('[{"id"')
if start_idx == -1:
    print("Could not find start of JSON")
    exit(1)
end_idx = result_text.rfind('}]') + 2
json_str = result_text[start_idx:end_idx]

try:
    logs = json.loads(json_str)
except Exception as e:
    print(f"JSON Error: {e}")
    exit(1)

# Sort logs ascending by timestamp to process chronology
logs.sort(key=lambda x: x['timestamp'])

order_state = {}

for log in logs:
    action = log['action']
    details = log['details']
    
    # Extract orderId
    m_order = re.search(r'orderId=([0-9a-f\-]+)', details)
    if not m_order:
        continue
    order_id = m_order.group(1)
    
    if order_id not in order_state:
        order_state[order_id] = {'inventory_id': None, 'profile_ids': None}
    
    # Check for inventoryId or inventoryItemId changes
    m_inv_create = re.search(r'inventoryId=([0-9a-f\-]+)', details)
    m_inv_update = re.search(r'inventoryItemId=(.*?)(?:;|$)', details)
    
    if action == "Tạo đơn hàng" and m_inv_create:
        inv_id = m_inv_create.group(1)
        if inv_id and inv_id != '-' and len(inv_id) > 5:
            order_state[order_id]['inventory_id'] = inv_id
            
        m_prof = re.search(r'profileIds=(.*?)(?:;|$)', details)
        if m_prof:
            profs = m_prof.group(1)
            if profs and profs != '-':
                # split by comma, json encode
                order_state[order_id]['profile_ids'] = profs.split(',')
                
    elif action == "Cập nhật đơn hàng" and m_inv_update:
        val = m_inv_update.group(1)
        if '->' in val:
            _, after = val.split('->')
            if len(after) > 5:
                order_state[order_id]['inventory_id'] = after
    
    m_prof_update = re.search(r'profileIds=.*?->(.*?)(?:;|$)', details)
    if action == "Cập nhật đơn hàng" and m_prof_update:
        profs = m_prof_update.group(1)
        if profs and profs != '-':
            order_state[order_id]['profile_ids'] = profs.split(',')

# Aggregate inventory profiles
inventory_state = {}

# Generate SQL Update queries
with open("sql_restore.sql", "w", encoding="utf-8") as out:
    out.write("-- SQL commands to restore order links\n")
    for order_id, state in order_state.items():
        inv_id = state['inventory_id']
        profs = state['profile_ids']
        
        if inv_id:
            profs_json = json.dumps(profs) if profs else "NULL"
            if profs_json != "NULL":
                profs_val = f"'{profs_json}'::jsonb"
            else:
                profs_val = "NULL"
            out.write(f"UPDATE orders SET inventory_item_id = '{inv_id}', inventory_profile_ids = {profs_val} WHERE id = '{order_id}';\n")
            
            if inv_id not in inventory_state:
                inventory_state[inv_id] = []
            if profs:
                for p_id in profs:
                    inventory_state[inv_id].append({'slot_id': p_id, 'order_id': order_id})

    out.write("\n-- SQL commands to restore inventory profiles\n")
    for inv_id, slots in inventory_state.items():
        if not slots:
            continue
            
        # We need to construct a JSON array of profiles.
        # Since we don't know the full slot count, we'll assume at least the max slot index found.
        max_slot = 0
        for s in slots:
            m = re.search(r'slot-(\d+)', s['slot_id'])
            if m:
                max_slot = max(max_slot, int(m.group(1)))
        
        # Default to at least 5 slots as seen in the code
        total_slots = max(max_slot, 5)
        
        profiles = []
        for i in range(1, total_slots + 1):
            s_id = f"slot-{i}"
            assigned = next((s for s in slots if s['slot_id'] == s_id), None)
            if assigned:
                profiles.append({
                    "id": s_id,
                    "isAssigned": True,
                    "assignedOrderId": assigned['order_id'],
                    "assignedAt": "2026-03-13T04:29:00Z" # Approximate
                })
            else:
                profiles.append({
                    "id": s_id,
                    "isAssigned": False,
                    "assignedOrderId": None
                })
        
        profiles_json = json.dumps(profiles)
        out.write(f"UPDATE inventory SET profiles = '{profiles_json}'::jsonb, is_account_based = true, total_slots = {total_slots} WHERE id = '{inv_id}';\n")

