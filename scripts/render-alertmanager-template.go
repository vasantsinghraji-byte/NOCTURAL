package main

import (
	"fmt"
	"os"
	"strings"
	"time"

	alerttemplate "github.com/prometheus/alertmanager/template"
	"github.com/prometheus/common/model"
)

func mustRender(t *alerttemplate.Template, name string, data alerttemplate.Data) string {
	rendered, err := t.ExecuteTextString(`{{ template "`+name+`" . }}`, data)
	if err != nil {
		fmt.Fprintf(os.Stderr, "render %s failed: %v\n", name, err)
		os.Exit(1)
	}
	return rendered
}

func requireContains(label, rendered, expected string) {
	if !strings.Contains(rendered, expected) {
		fmt.Fprintf(os.Stderr, "%s missing expected text %q\nrendered:\n%s\n", label, expected, rendered)
		os.Exit(1)
	}
}

func main() {
	t, err := alerttemplate.FromGlobs("prometheus/templates/*.tmpl")
	if err != nil {
		fmt.Fprintf(os.Stderr, "parse alertmanager templates failed: %v\n", err)
		os.Exit(1)
	}

	startedAt := time.Date(2026, 6, 16, 3, 30, 0, 0, time.UTC)
	data := alerttemplate.Data{
		Status: "firing",
		CommonLabels: model.LabelSet{
			"alertname":   "SecurityNotificationOutboxDeadLetters",
			"component":   "security",
			"environment": "staging",
			"severity":    "critical",
		},
		Alerts: alerttemplate.Alerts{
			{
				Status: "firing",
				Labels: model.LabelSet{
					"alertname": "SecurityNotificationOutboxDeadLetters",
					"component": "security",
					"severity":  "critical",
				},
				Annotations: model.LabelSet{
					"summary":     "Security notification outbox contains dead letters",
					"description": "3 notifications require manual intervention",
					"runbook":     "https://runbooks.nocturnal.com/security-notification-outbox",
				},
				StartsAt: startedAt,
			},
		},
	}

	title := mustRender(t, "nocturnal.title", data)
	text := mustRender(t, "nocturnal.text", data)
	securityText := mustRender(t, "nocturnal.security.text", data)

	requireContains("title", title, "[FIRING] CRITICAL SecurityNotificationOutboxDeadLetters")
	requireContains("text", text, "Environment: staging")
	requireContains("text", text, "Runbook: https://runbooks.nocturnal.com/security-notification-outbox")
	requireContains("securityText", securityText, "Security incident notification")
	requireContains("securityText", securityText, "Incident commander is required")

	fmt.Println("alertmanager template rendering ok")
}
