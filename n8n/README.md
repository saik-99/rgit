# n8n Emergency WhatsApp Alert Workflow

Automated incident dispatch workflow powered by n8n, Google Gemini 1.5, and Twilio WhatsApp.

### 5-Step Setup

1. **Start n8n**:
   ```bash
   npx n8n
   ```
   Open `http://localhost:5678` in your browser.

2. **Import Workflow**:
   Click **Workflows** > **Import from File** and select [`incident_alert_workflow.json`](./incident_alert_workflow.json).

3. **Add Credentials**:
   - **Gemini API**: Add your Google MakerSuite / AI Studio API key (`Google PaLM / Gemini API`).
   - **Twilio account**: Add your Twilio Account SID and Auth Token (`Twilio API`).

4. **Activate Workflow**:
   Toggle the workflow switch from **Inactive** to **Active** (top right) and click **Save**.

5. **Configure Backend**:
   Copy the Webhook Production URL (e.g. `http://localhost:5678/webhook/incident-alert`) and paste it into `backend/.env`:
   ```env
   N8N_WEBHOOK_URL=http://localhost:5678/webhook/incident-alert
   ALERT_RECIPIENTS=+917972253404,+918261080711
   ```
