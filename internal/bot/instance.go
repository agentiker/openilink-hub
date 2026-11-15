package bot

import (
	"context"

	"github.com/openilink/openilink-hub/internal/provider"
)

// Instance wraps a provider with its lifecycle.
type Instance struct {
	DBID      string
	UserID    string
	Provider  provider.Provider
	AIEnabled bool
	AIModel   string
	cancel    context.CancelFunc
}

func NewInstance(dbID string, p provider.Provider) *Instance {
	return &Instance{DBID: dbID, Provider: p}
}

func (i *Instance) Status() string { return i.Provider.Status() }

// Quota returns the send-allowance layer if the provider has one.
func (i *Instance) Quota() *QuotaProvider {
	q, _ := i.Provider.(*QuotaProvider)
	return q
}

func (i *Instance) Send(ctx context.Context, msg provider.OutboundMessage) (string, error) {
	return i.Provider.Send(ctx, msg)
}

func (i *Instance) Stop() {
	i.Provider.Stop()
}
