package fr.nexora.loading;

import com.mojang.blaze3d.platform.NativeImage;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;

import java.io.InputStream;

/** Dessin commun : fond lobby.png en plein écran (cover), barre de chargement et texte. */
public final class LoadingRenderer {
    public static final Identifier BACKGROUND = Identifier.fromNamespaceAndPath(NexoraLoadingClient.MOD_ID, "lobby.png");
    public static final Component TEXT = Component.literal("Connexion à Nexora SMP...");

    private static int imageWidth = -1;
    private static int imageHeight = -1;

    private LoadingRenderer() {}

    private static void readImageSize() {
        if (imageWidth > 0) {
            return;
        }
        imageWidth = 1920;
        imageHeight = 1014;
        try (InputStream in = Minecraft.getInstance().getResourceManager().open(BACKGROUND);
             NativeImage image = NativeImage.read(in)) {
            imageWidth = image.getWidth();
            imageHeight = image.getHeight();
        } catch (Exception e) {
            NexoraLoadingClient.LOGGER.warn("Taille de lobby.png illisible, 1920x1014 supposé", e);
        }
    }

    /** Fond plein écran : l'image couvre tout l'écran, recadrée au centre, sans flou. */
    public static void renderBackground(GuiGraphics g, int width, int height) {
        readImageSize();
        g.fill(0, 0, width, height, 0xFF000000);
        float screenRatio = (float) width / height;
        float imageRatio = (float) imageWidth / imageHeight;
        int regionW = imageWidth;
        int regionH = imageHeight;
        if (screenRatio > imageRatio) {
            regionH = Math.round(imageWidth / screenRatio);
        } else {
            regionW = Math.round(imageHeight * screenRatio);
        }
        float u = (imageWidth - regionW) / 2f;
        float v = (imageHeight - regionH) / 2f;
        g.blit(RenderPipelines.GUI_TEXTURED, BACKGROUND, 0, 0, u, v, width, height, regionW, regionH, imageWidth, imageHeight);
    }

    /** Barre de chargement et « Connexion à Nexora SMP... » en bas de l'écran. */
    public static void renderProgress(GuiGraphics g, Font font, int width, int height, float progress) {
        int barW = Math.min(320, width - 40);
        int barH = 6;
        int x = (width - barW) / 2;
        int y = height - Math.max(40, height / 6);

        // Bandeau sombre derrière le texte et la barre, pour rester lisible sur l'image.
        g.fill(0, y - 24, width, y + barH + 16, 0x66000000);
        g.drawCenteredString(font, TEXT, width / 2, y - 16, 0xFFFFFFFF);

        g.fill(x - 1, y - 1, x + barW + 1, y + barH + 1, 0xFF0B0B12);
        g.fill(x, y, x + barW, y + barH, 0xFF262636);
        int filled = Math.round(barW * Math.max(0f, Math.min(1f, progress)));
        if (filled > 0) {
            g.fill(x, y, x + filled, y + barH, 0xFF8B5CF6);
            g.fill(x, y, x + filled, y + 2, 0xFFB79CFF);
            // Reflet qui glisse sur la partie remplie : montre que ça avance.
            long t = System.currentTimeMillis() % 1600L;
            int shine = x + (int) ((filled + 40) * (t / 1600f)) - 40;
            int s0 = Math.max(x, shine);
            int s1 = Math.min(x + filled, shine + 40);
            if (s1 > s0) {
                g.fill(s0, y, s1, y + barH, 0x40FFFFFF);
            }
        }
        g.drawCenteredString(font, Math.round(progress * 100) + " %", width / 2, y + barH + 5, 0xFFCFCFE0);
    }
}
