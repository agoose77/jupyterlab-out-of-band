import { IRenderMime } from '@jupyterlab/rendermime-interfaces';
import { IRenderMimeRegistry, MimeModel } from '@jupyterlab/rendermime';
import { Contents } from '@jupyterlab/services';
import { JSONObject } from '@lumino/coreutils';
import type {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { Widget, SingletonLayout } from '@lumino/widgets';

/**
 * The default mime type for the extension.
 */
const MIME_TYPE = 'application/vnd.nbtx.output+json';

/**
 * The class name added to the extension.
 */
const CLASS_NAME = 'mimerenderer-out-of-band';

export interface IRenderMimeProvider {
  resolveHash(hash: string): Promise<IRenderMime.IMimeModel['data']>;
}

export type OutOfBandMimeRendererOptions = IRenderMime.IRendererOptions & {
  registry: IRenderMimeRegistry;
  provider: IRenderMimeProvider;
};
/**
 * A widget for rendering Out of Band MIME.
 */
export class OutOfBandMimeRenderer
  extends Widget
  implements IRenderMime.IRenderer
{
  registry: IRenderMimeRegistry;
  provider: IRenderMimeProvider;

  /**
   * Construct a new output widget.
   */ constructor(options: OutOfBandMimeRendererOptions) {
    super();
    this._mimeType = options.mimeType;
    this.addClass(CLASS_NAME);

    this.registry = options.registry;
    this.provider = options.provider;
    this.layout = new SingletonLayout();
  }

  /**
   * Render Out of Band MIME into this widget's node.
   */
  async renderModel(model: IRenderMime.IMimeModel): Promise<void> {
    const data = model.data[this._mimeType] as JSONObject;
    const hash = data['hash'] as string;

    const possibleMimeTypes = data['mimeTypes'] as string[];
    const placeholderBundle: { [key: string]: string } = {};
    possibleMimeTypes.forEach(mimeType => {
      placeholderBundle[mimeType] = '';
    });
    const preferredMimeType =
      this.registry.preferredMimeType(placeholderBundle) ??
      possibleMimeTypes[0];

    const layout = this.layout as SingletonLayout;
    if (layout.widget) {
      layout.widget.dispose();
    }

    const trueData = await this.provider.resolveHash(hash);
    const trueModel = new MimeModel({
      metadata: model.metadata,
      trusted: model.trusted,
      data: trueData
    });
    const widget = this.registry.createRenderer(preferredMimeType);
    layout.widget = widget;
    await widget.renderModel(trueModel);
  }

  private _mimeType: string;
}

const createFactory = (
  registry: IRenderMimeRegistry,
  provider: IRenderMimeProvider
) => {
  return {
    mimeTypes: [MIME_TYPE],
    safe: false,
    createRenderer: (options: IRenderMime.IRendererOptions) => {
      return new OutOfBandMimeRenderer({ ...options, registry, provider });
    }
  };
};

export class OutOfBandMimeProvider implements IRenderMimeProvider {
  contents: Contents.IManager;
  constructor(contents: Contents.IManager) {
    this.contents = contents;
  }

  async resolveHash(hash: string): Promise<IRenderMime.IMimeModel['data']> {
    const model = await this.contents.get(`/mime/${hash}.json`);
    return JSON.parse(model.content);
  }
}

export const plugin: JupyterFrontEndPlugin<void> = {
  id: 'out-of-band-mime:plugin',
  autoStart: true, // Activate this plugin immediately
  requires: [IRenderMimeRegistry],
  activate: (app: JupyterFrontEnd, registry: IRenderMimeRegistry) => {
    const provider = new OutOfBandMimeProvider(app.serviceManager.contents);
    const factory = createFactory(registry, provider);
    registry.addFactory(factory);
  }
};

export default plugin;
