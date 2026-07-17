using Rezio.ChannelSync.Domain;

namespace Rezio.Api;

// Buduje adapter dla providera połączenia. Dziś zawsze syntetyczny;
// prawdziwe adaptery (Beds24/Smoobu/Hostaway) wejdą tutaj za IChannelAdapter.
public interface IAdapterFactory
{
    IChannelAdapter For(ChannelProvider provider);
}

public sealed class SyntheticAdapterFactory : IAdapterFactory
{
    public IChannelAdapter For(ChannelProvider provider) => new SyntheticChannelAdapter(provider);
}
